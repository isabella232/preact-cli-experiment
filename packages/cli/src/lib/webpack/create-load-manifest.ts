const isESM = (filename: string) => /\.esm\.js$/.test(filename);
const isMatch = (filename: string, condition: boolean) => isESM(filename) === condition;

interface Manifest {
	type: string;
	weight: number;
}

type Dict<T> = Record<string, T>;

export default function createLoadManifest(
	assets: Array<string>,
	isESMBuild = false,
	namedChunkGroups: Map<string, { chunks?: { files: string[] }[] }>
) {
	let mainJs: string, mainCss: string;
	const scripts: string[] = [],
		styles: string[] = [];
	for (const filename in assets) {
		if (!/\.map$/.test(filename)) {
			if (/route-/.test(filename)) {
				// both ESM & regular match here
				isMatch(filename, isESMBuild) && scripts.push(filename);
			} else if (/chunk\.(.+)\.css$/.test(filename)) {
				styles.push(filename);
			} else if (/^bundle(.+)\.css$/.test(filename)) {
				mainCss = filename;
			} else if (/^bundle(.+)\.js$/.test(filename)) {
				// both ESM & regular bundles match here
				if (isMatch(filename, isESMBuild)) {
					mainJs = filename;
				}
			}
		}
	}

	const defaults: Dict<Manifest> = {
		[mainCss]: {
			type: "style",
			weight: 1
		},
		[mainJs]: {
			type: "script",
			weight: 1
		}
	},
		manifest: Dict<Dict<Manifest>> = {
			"/": defaults
		};

	let path: string, css: string, obj: Dict<Manifest>;
	scripts.forEach((filename, idx) => {
		css = styles[idx];
		obj = Object.assign({}, defaults);
		obj[filename] = { type: "script", weight: 0.9 };
		if (css) obj[css] = { type: "style", weight: 0.9 };
		path = filename
			.replace(/route-/, "/")
			.replace(/\.chunk(\.\w+)?(\.esm)?\.js$/, "")
			.replace(/\/home/, "/");
		if (namedChunkGroups) {
			// async files to be loaded, generated by splitChunksPlugin
			const asyncFiles = namedChunkGroups.get(filename.replace(/\.chunk(\.\w+)?(\.esm)?\.js$/, "")) || {};
			if (asyncFiles && asyncFiles.chunks) {
				asyncFiles.chunks.forEach(asset => {
					asset.files = asset.files || [];
					asset.files.forEach(file => {
						if (/\.css$/.test(file)) {
							obj[file] = { type: "style", weight: 0.9 };
						} else if (/\.js$/.test(file)) {
							obj[file] = { type: "script", weight: 0.9 };
						}
					});
				});
			}
		}
		manifest[path] = obj;
	});

	return manifest;
}
