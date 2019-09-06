import path from "path";

import PluginAPI from "./plugin";
import Config from "webpack-chain";
import { CommanderStatic } from "commander";

export class PluginRegistry {
	private registry: Map<string, PluginAPI>;

	public static fromPlugins(base: string, commander: CommanderStatic, plugins: string[]) {
		const registry = new PluginRegistry();
		for (const plugin of plugins.map(name => {
			const path = require.resolve(name);
			return new PluginAPI(base, name, path, commander);
		})) {
			registry.add(plugin);
		}

		return registry;
	}
	constructor() {
		this.registry = new Map();
	}
	public add(plugin: PluginAPI) {
		if (this.registry.has(plugin.id)) throw new Error("Plugin is already in the registry!");
		this.registry.set(plugin.id, plugin);
	}

	public hookWebpackChain(config: Config) {
		for (const plugin of this.registry.values()) {
			plugin.getChains().forEach(chainer => chainer(config));
		}
	}

	public invoke<A = unknown>(funcName: string, options: Record<string, object> = {}): (A | undefined)[] {
		return [...this.registry.values()].map(plugin => {
			const mod = require(plugin.importBase)[funcName];
			if (mod) {
				const defaultOptions = {
					cwd: process.env.PREACT_CLI_CWD || process.cwd(),
					packageManager: process.env.PREACT_CLI_PACKAGE_MANAGER || "npm"
				};
				return mod(plugin, Object.assign({}, defaultOptions, options));
			} else undefined;
		});
	}
}
