import { readXgwx } from './xgwx.js';
import { projectGraph } from './xgwx-graph.js';
import { validateProject } from './graph.js';

self.onmessage = async ({ data: file }) => {
  try {
    const project = file.name.toLowerCase().endsWith('.xgwx')
      ? projectGraph(await readXgwx(await file.arrayBuffer()))
      : JSON.parse(await file.text());
    self.postMessage({ project: validateProject(project) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
