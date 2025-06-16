import * as LangServerBuild from './build.mjs';

export const init = (workspaceModulesMap) => {
  return new Map(workspaceModulesMap);
};

export const findModule = (store, filePath) => {
  for (const [workspaceDir, moduleMap] of store) {
    // Ensure the path is actually within the workspace directory, not just starting with it
    if (filePath.startsWith(workspaceDir) &&
        (filePath.length === workspaceDir.length || filePath[workspaceDir.length] === '/')) {
      return moduleMap.get(filePath) || null;
    }
  }
  return null;
};

export const updateModule = (store, filePath, newContents) => {
  for (const [workspaceDir, moduleMap] of store) {
    // Ensure the path is actually within the workspace directory, not just starting with it
    if (filePath.startsWith(workspaceDir) &&
        (filePath.length === workspaceDir.length || filePath[workspaceDir.length] === '/')) {
      const moduleProvider = (path) => moduleMap.has(path);
      const importResolver = LangServerBuild.createImportResolver(moduleProvider);
      const updatedModule = LangServerBuild.createModuleFromSource(newContents, filePath, workspaceDir, importResolver);

      moduleMap.set(filePath, updatedModule);
      return updatedModule;
    }
  }
  return null;
};

export const workspaceDirFromFilePath = (store, filePath) => {
  for (const [workspaceDir, moduleMap] of store) {
    // Ensure the path is actually within the workspace directory, not just starting with it
    if (filePath.startsWith(workspaceDir) &&
        (filePath.length === workspaceDir.length || filePath[workspaceDir.length] === '/')) {
      return workspaceDir;
    }
  }
  return null;
};

export const workspaceDirModules = (store, workspaceDir) => {
  const modules = [];
  for (const [filePath, module] of store.get(workspaceDir)) {
    modules.push(module);
  }
  return modules;
};
