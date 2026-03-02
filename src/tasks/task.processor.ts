import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { MockService } from '../mock/mock.service';
import { TASK_QUEUE } from './constants';

@Processor(TASK_QUEUE)
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly mockService: MockService,
  ) {
    super();
  }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    const { taskId } = job.data;

    const task = await this.taskRepository.findOne({ where: { id: taskId } });

    if (!task) {
      this.logger.warn(`Task ${taskId} not found, skipping`);
      return;
    }

    if (task.status === TaskStatus.CANCELLED) {
      this.logger.log(`Task ${taskId} was cancelled, skipping`);
      return;
    }

    task.status = TaskStatus.PROCESSING;
    task.startedAt = new Date();
    task.attempts += 1;
    await this.taskRepository.save(task);

    try {
      this.logger.log(`Processing task ${taskId} (attempt ${task.attempts})`);

      await this.mockService.processTask(task.payload);

      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      task.lastError = null;
      await this.taskRepository.save(task);

      this.logger.log(`Task ${taskId} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      task.lastError = errorMessage;

      const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

      if (isLastAttempt) {
        task.status = TaskStatus.FAILED;
        this.logger.error(`Task ${taskId} failed permanently: ${errorMessage}`);
      } else {
        task.status = TaskStatus.PENDING;
        this.logger.warn(`Task ${taskId} failed, will retry: ${errorMessage}`);
      }

      await this.taskRepository.save(task);
      throw error;
    }
  }
}
