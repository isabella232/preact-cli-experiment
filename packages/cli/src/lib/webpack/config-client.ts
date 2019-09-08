import fs, { existsSync } from "fs";
import path from "path";
import Config, { PluginClass } from "webpack-chain";
import { filter } from "minimatch";
import webpack from "webpack";
import CopyWebpackPlugin from "copy-webpack-plugin";
import OptimizeCssAssetsPlugin from "optimize-css-assets-webpack-plugin";
import BabelEsmPlugin from "babel-esm-plugin";
import { InjectManifest } from "workbox-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import { normalizePath } from "../../utils";
import configBase from "./config-base";
import { WebpackEnvExtra } from "../../types";
import PushManifestPlugin from "./push-manifest";
import SWBuilderPlugin from "./sw-builder";

export default function configClient(env: WebpackEnvExtra) {
	return clientConfiguration(configBase(env), env);
}

function clientConfiguration(config: Config, env: WebpackEnvExtra): Config {
	config
		.entry("bundle")
		.add(path.resolve(__dirname, "../../../assets/entry"))
		.end()
		.entry("polyfills")
		.add(path.resolve(__dirname, "./polyfills"))
		.end();
	if (env.isProd) {
		config
			.entry("bundle")
			.add("webpack-dev-server/client")
			.add("webpack/hot/dev-server")
			.end();
	}
	config.output
		.path(env.dest)
		.publicPath("/")
		.filename(env.isProd ? "[name].[chunkhash:5].js" : "[name].js")
		.chunkFilename("[name].chunk.[chunkhash:5].js")
		.end();
	config.resolveLoader.alias
		.set("async", require.resolve("@preact/async-loader"))
		.end()
		.end();
	config.module
		.rule("components")
		.test(/\.[jt]sx?$/)
		.include.add(filter(env.source("routes") + "/{*,*/index}.{js,jsx,ts,tsx}") as any)
		.add(filter(env.source("components") + "/{routes,async}/{*,*/index}.js,jsx,ts,tsx}") as any)
		.end()
		.use(require.resolve("@preact/async-loader"))
		.options({
			name(filename: string) {
				const relative = normalizePath(filename).replace(normalizePath(env.src), "");
				if (!relative.includes("/routes/")) return false;
				return "route-" + cleanFilename(relative);
			},
			formatName(filename: string) {
				const relative = normalizePath(filename).replace(normalizePath(env.source(".")), "");
				return cleanFilename(relative);
			}
		})
		.end();
	return config
		.plugin("push-manifest")
		.use(PushManifestPlugin, [env])
		.end()
		.plugin("copy")
		.use(CopyWebpackPlugin, [
			[
				...(fs.existsSync(env.source("manifest.json"))
					? [{ from: "manifest.json" }]
					: [
							{ from: path.resolve(__dirname, "../../../assets/manifest.json"), to: "manifest.json" },
							{ from: path.resolve(__dirname, "../../../assets/icon.png"), to: "assets/icon.png" }
					  ]),
				existsSync(env.source("assets")) && { from: "assets", to: "assets" },
				{
					from: path.resolve(__dirname, "../../../assets/resources/sw-debug.js"),
					to: "sw-debug.js"
				},
				existsSync(env.source("static")) && { from: path.resolve(env.source("static")), to: "." }
			].filter(Boolean)
		])
		.end();
}

function babelEsmPlugin(config: Config, env: WebpackEnvExtra): Config {
	if (env.esm) {
		config.plugin("esm").use(BabelEsmPlugin, [
			{
				filename: env.isProd ? "[name].[chunkhash:5].esm.js" : "[name].esm.js",
				chunkFilename: "[name].chunk.[chunkhash:5].esm.js",
				excludedPlugins: ["BabelEsmPlugin", "SWBuilderPlugin"],
				beforeStartExecution: (plugins: any[], newConfig: { plugins: any[] }) => {
					const babelPlugins = newConfig.plugins;
					newConfig.plugins = babelPlugins.filter((plugin: { indexOf: (arg0: string) => number }[]) => {
						if (Array.isArray(plugin) && plugin[0].indexOf("fast-async") !== -1) {
							return false;
						}
						return true;
					});
					plugins.forEach(plugin => {
						if (plugin.constructor.name === "DefinePlugin" && plugin.definitions) {
							for (const definition in plugin.definitions) {
								if (definition === "process.env.ES_BUILD") {
									plugin.definitions[definition] = true;
								}
							}
						} else if (plugin.constructor.name === "DefinePlugin" && !plugin.definitions) {
							throw new Error("WebpackDefinePlugin found but not `process.env.ES_BUILD`.");
						}
					});
				}
			}
		]);
	}
	return config;
}

function production(config: Config, env: WebpackEnvExtra): Config {
	const limit = 200e3; // 200 kb

	config.performance
		.merge(
			Object.assign(
				{ hints: "warning", maxAssetSize: limit, maxEntrypointSize: limit },
				(env.pkg || {}).performance
			)
		)
		.end()
		.plugin("define")
		.use(webpack.DefinePlugin, [
			{ "process.env.ADD_SW": env.sw, "process.env.ES_BUILD": false, "process.env.ESM": false }
		])
		.end()
		.optimization.minimizer("terser")
		.use(TerserPlugin, [
			{
				cache: true,
				parallel: true,
				terserOptions: {
					output: { comments: false },
					mangle: true,
					compress: {
						/* eslint-disable @typescript-eslint/camelcase */
						keep_fargs: false,
						pure_getters: true,
						hoist_funs: true,
						pure_funcs: [
							"classCallCheck",
							"_classCallCheck",
							"_possibleConstructorReturn",
							"Object.freeze",
							"invariant",
							"warning"
						]
						/* eslint-enable @typescript-eslint/camelcase */
					}
				},
				sourceMap: true
			}
		])
		.end()
		.minimizer("css")
		.use(OptimizeCssAssetsPlugin, [{ cssProcessorOptions: { reduceIndents: false } }]);
	if (env.esm) {
		config.plugin("babel").use(BabelEsmPlugin, [
			{
				filename: "[name].[chunkhash:5].esm.js",
				chunkFilename: "[name].chunk.[chunkhash:5].esm.js",
				excludedPlugins: ["BabelEsmPlugin", "SWBuilderPlugin"],
				beforeStartExecution: (plugins: (PluginClass & { definitions: any })[], newConfig: any) => {
					const babelPlugins: (string | string[])[] = newConfig.plugins;
					newConfig.plugins = babelPlugins.filter(plugin => {
						if (Array.isArray(plugin) && plugin[0].indexOf("fast-async") !== -1) {
							return false;
						}
						return true;
					});
					plugins.forEach(plugin => {
						if (plugin.constructor.name === "DefinePlugin" && plugin.definitions) {
							for (const definition in plugin.definitions) {
								if (definition === "process.env.ES_BUILD") {
									plugin.definitions[definition] = true;
								}
							}
						} else if (plugin.constructor.name === "DefinePlugin" && !plugin.definitions) {
							throw new Error("WebpackDefinePlugin found but not `process.env.ES_BUILD`.");
						}
					});
				}
			}
		]);
		if (env.sw) {
			config.plugin("inject-manifest").use(InjectManifest, [
				{
					swSrc: "sw-esm.js",
					include: [/^\/?index\.html$/, /\.esm.js$/, /\.css$/, /\.(png|jpg)$/],
					precacheManifestFilename: "precache-manifest.[manifestHash].esm.js"
				}
			]);
		}
	}
	if (env.sw) {
		config.plugin("sw-builder").use(SWBuilderPlugin, [config]);
	}

	return config;
}

function cleanFilename(name: string) {
	return name.replace(/(^\/(routes|components\/(routes|async))\/|(\/index)?\.js$)/g, "");
}
