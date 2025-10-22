const PATH = require('path');
const INFO = require('./package.json');
const SHARP = require('sharp');

const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const ICON_SIZES = [16, 24, 32, 48, 64, 96, 128]

const CreateFilePlugin = class {
    constructor(options) {
        this.options = options;
    }

    apply(compiler) {
        compiler.hooks.emit.tap('CreateFilePlugin', () => {
            require('write').sync(PATH.join(this.options.path, this.options.name), this.options.content);
        });
    }
};

function copyPluginIconPatterns () {
    const res = ICON_SIZES.map(size => {
        return {
            from: 'icon.svg',
            to: `icon-${size}.png`,
            async transform (content) {
                return SHARP(content).resize(size).png().toBuffer()
            }
        }
    })
    return res;
}

function makeManifest(manifestVersion) {

    const domains = [
        'https://wol.jw.org/*/wol/*'
    ];

    const manifest = {};
    manifest.name = INFO.description;
    manifest.version = INFO.version;
    manifest.description = INFO.properties.description;
    manifest.manifest_version = manifestVersion;

    manifest.content_scripts = [{
        matches: domains,
        js: ['content.bundle.js'],
        ...(manifestVersion === 3 && { world: 'ISOLATED' })
    }];

    manifest[manifestVersion === 2 ? 'browser_action' : 'action'] = {
        default_popup: 'popup.html',
        ...(manifestVersion === 2 && { browser_style: true })
    };

    manifest.permissions = ['storage', 'tabs'];

    if(process.env.EXTENSION_ID)
        manifest.browser_specific_settings = {
            gecko: {
                id: process.env.EXTENSION_ID
            }
        }

    ICON_SIZES.forEach((size) => {
        let entry = {};
        entry[size] = `icon-${size}.png`;
        manifest.icons = Object.assign(entry, manifest.icons || {});
    });

    return JSON.stringify(manifest, null, '\t');
}

function genConfig(argv, manifestVersion) {
    const config = {
        entry: {
            style: './src/popup.scss'
        },
        output: {
            filename: "[name].bundle.js",
            path: PATH.resolve(__dirname, `./dist/v${manifestVersion}/`)
        },
        module: {
            rules: [
                {
                    test: /\.s[ac]ss$/i,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'file-loader',
                            options: {
                                name: '[name].min.css'
                            }
                        }, {
                            loader: 'sass-loader',
                            options: {
                                api: "modern"
                            }
                        }
                    ]
                }
            ]
        },
        plugins: [
            new CleanWebpackPlugin(),
            new CreateFilePlugin({
                path: `./dist/v${manifestVersion}/`,
                name: './manifest.json',
                content: makeManifest(manifestVersion)
            }),
            new (require('copy-webpack-plugin'))({
                patterns: [
                    { from: './src/popup.html' },
                    ...copyPluginIconPatterns()
                ]
            }),
            new (require('eslint-webpack-plugin'))(),
            new (require('webpack-shell-plugin-next'))({
                onBuildEnd: {
                    scripts: [`./node_modules/.bin/crx3 ./dist/v${manifestVersion}/ \
                        --key ./keys/key.pem \
                        --xml ./packages/${INFO.name}-v${manifestVersion}.xml \
                        --crx ./packages/${INFO.name}-v${manifestVersion}.crx \
                        --crxURL ${INFO.homepage}/releases/download/v${INFO.version}/${INFO.name}-v${manifestVersion}.crx`]
                }
            })
        ]
    };

    ['content', 'popup'].forEach((file) => {
        config.entry[`${file}`] = `./src/${file}.js`;
    });

    return config;
};

module.exports = function (env, argv) {
    return [
        Object.assign({}, genConfig(argv, 2)),
        Object.assign({}, genConfig(argv, 3))
    ];
};
module.exports.parallelism = 1;
