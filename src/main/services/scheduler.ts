import schedule from "node-schedule";
import { createChildLogger } from "../common";

const logger = createChildLogger("Scheduler");

export type TaskFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface ScheduledTask {
  id: string;
  name: string;
  frequency: TaskFrequency;
  handler: () => Promise<void>;
  lastRun?: Date;
  nextRun?: Date;
}

const CRON_PATTERNS: Record<TaskFrequency, string> = {
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
  quarterly: "0 9 1 1,4,7,10 *",
  yearly: "0 9 1 1 *",
};

export class TaskScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private jobs: Map<string, schedule.Job> = new Map();
  private isRunning = false;

  registerTask(task: ScheduledTask): void {
    this.tasks.set(task.id, task);
    logger.info({ taskId: task.id, frequency: task.frequency }, "Task registered");
  }

  start(): void {
    if (this.isRunning) return;

    this.tasks.forEach((task) => {
      const cronPattern = CRON_PATTERNS[task.frequency];
      const job = schedule.scheduleJob(cronPattern, async () => {
        await this.executeTask(task);
      });

      if (job) {
        this.jobs.set(task.id, job);
        task.nextRun = job.nextInvocation() ?? undefined;
        logger.info(
          { taskId: task.id, nextRun: task.nextRun },
          "Task scheduled"
        );
      }
    });

    this.isRunning = true;
    logger.info({ taskCount: this.tasks.size }, "Scheduler started");
  }

  stop(): void {
    this.jobs.forEach((job, taskId) => {
      job.cancel();
      logger.info({ taskId }, "Task cancelled");
    });
    this.jobs.clear();
    this.isRunning = false;
    logger.info("Scheduler stopped");
  }

  async executeTask(task: ScheduledTask): Promise<void> {
    logger.info({ taskId: task.id }, "Executing task");

    try {
      await task.handler();
      task.lastRun = new Date();

      const job = this.jobs.get(task.id);
      if (job) {
        task.nextRun = job.nextInvocation() ?? undefined;
      }

      logger.info({ taskId: task.id }, "Task completed");
    } catch (error) {
      logger.error({ error, taskId: task.id }, "Task execution failed");
    }
  }

  async runTaskNow(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    await this.executeTask(task);
  }

  getTaskStatus(): Array<{
    id: string;
    name: string;
    frequency: TaskFrequency;
    lastRun?: Date;
    nextRun?: Date;
  }> {
    return Array.from(this.tasks.values()).map((task) => ({
      id: task.id,
      name: task.name,
      frequency: task.frequency,
      lastRun: task.lastRun,
      nextRun: task.nextRun,
    }));
  }
}
