import { Worker } from "node:worker_threads";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { HeadTag } from "../types.js";

/**
 * Map over items with a concurrency limit.
 * Like Promise.all but limits how many items are processed at once.
 */
export async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/** Get the number of available CPU cores for parallel work */
export function getParallelism(): number {
  return Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
}

const SSR_WORKER_CODE = `
'use strict';
const { parentPort, workerData } = require('worker_threads');
const { createRequire } = require('module');
const path = require('path');

const projectRequire = createRequire(
  path.join(workerData.projectRoot, 'package.json')
);

parentPort.on('message', (task) => {
  if (task.type === 'exit') {
    process.exit(0);
  }

  const { ssrHelperPath, pageModulePath, appModulePath, pageProps, taskId } = task;

  try {
    delete projectRequire.cache[projectRequire.resolve(ssrHelperPath)];
    delete projectRequire.cache[projectRequire.resolve(pageModulePath)];

    const ssrHelper = projectRequire(ssrHelperPath);
    const pageMod = projectRequire(pageModulePath);
    const Page = pageMod.default || pageMod;

    let App = ssrHelper.defaultApp;
    if (appModulePath) {
      delete projectRequire.cache[projectRequire.resolve(appModulePath)];
      const appMod = projectRequire(appModulePath);
      App = appMod.default || appMod;
    }

    const { html, headTags } = ssrHelper.ssrRender(App, Page, pageProps);
    parentPort.postMessage({ taskId, html, headTags });
  } catch (error) {
    parentPort.postMessage({ taskId, error: error.message });
  }
});
`;

export interface SSRTask {
  ssrHelperPath: string;
  pageModulePath: string;
  appModulePath: string | null;
  pageProps: Record<string, any>;
}

export interface SSRResult {
  html: string;
  headTags: HeadTag[];
}

/** Minimum number of pages before using worker threads (to avoid overhead for small builds) */
const WORKER_THRESHOLD = 4;

/**
 * Pool of worker threads for parallel SSR rendering.
 * Each worker runs React's renderToString in its own thread,
 * bypassing the single-threaded limitation for CPU-bound work.
 */
export class SSRWorkerPool {
  private workers: Worker[] = [];
  private workerScriptPath: string;
  private taskCallbacks = new Map<
    number,
    { resolve: (result: SSRResult) => void; reject: (error: Error) => void }
  >();
  private nextTaskId = 0;
  private availableWorkers: Worker[] = [];
  private pendingTasks: Array<{
    task: SSRTask & { taskId: number };
    resolve: (result: SSRResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(projectRoot: string, poolSize: number) {
    const tmpDir = path.join(projectRoot, ".suivant", "workers");
    fs.mkdirSync(tmpDir, { recursive: true });
    this.workerScriptPath = path.join(tmpDir, "ssr-worker.cjs");
    fs.writeFileSync(this.workerScriptPath, SSR_WORKER_CODE);

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(this.workerScriptPath, {
        workerData: { projectRoot },
      });

      worker.on("message", (msg: { taskId: number; html?: string; headTags?: HeadTag[]; error?: string }) => {
        const pending = this.taskCallbacks.get(msg.taskId);
        if (!pending) return;
        this.taskCallbacks.delete(msg.taskId);

        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve({ html: msg.html!, headTags: msg.headTags! });
        }

        // Dispatch next pending task or mark worker available
        const next = this.pendingTasks.shift();
        if (next) {
          this.dispatchToWorker(worker, next.task, next.resolve, next.reject);
        } else {
          this.availableWorkers.push(worker);
        }
      });

      worker.on("error", (err: Error) => {
        // Reject all pending tasks for this worker
        for (const [id, cb] of this.taskCallbacks) {
          cb.reject(err);
          this.taskCallbacks.delete(id);
        }
      });

      this.availableWorkers.push(worker);
      this.workers.push(worker);
    }
  }

  private dispatchToWorker(
    worker: Worker,
    task: SSRTask & { taskId: number },
    resolve: (result: SSRResult) => void,
    reject: (error: Error) => void
  ) {
    this.taskCallbacks.set(task.taskId, { resolve, reject });
    worker.postMessage(task);
  }

  render(task: SSRTask): Promise<SSRResult> {
    return new Promise((resolve, reject) => {
      const taskId = this.nextTaskId++;
      const fullTask = { ...task, taskId };
      const worker = this.availableWorkers.pop();
      if (worker) {
        this.dispatchToWorker(worker, fullTask, resolve, reject);
      } else {
        this.pendingTasks.push({ task: fullTask, resolve, reject });
      }
    });
  }

  async destroy() {
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve) => {
            w.on("exit", () => resolve());
            w.postMessage({ type: "exit" });
            setTimeout(() => {
              w.terminate();
              resolve();
            }, 2000);
          })
      )
    );
  }

  /**
   * Returns true if there are enough pages to justify worker thread overhead.
   */
  static shouldUseWorkers(pageCount: number): boolean {
    return pageCount >= WORKER_THRESHOLD;
  }
}
