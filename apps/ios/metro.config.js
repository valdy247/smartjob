// Shared interface catalog/controller live at the repository root. Keep React native-local.
const {getDefaultConfig}=require("expo/metro-config");
const path=require("path");
const config=getDefaultConfig(__dirname);
const repositoryRoot=path.resolve(__dirname,"../..");
config.watchFolders=[...(config.watchFolders||[]),repositoryRoot];
config.resolver.nodeModulesPaths=[path.resolve(__dirname,"node_modules"),path.resolve(repositoryRoot,"node_modules")];
module.exports=config;
