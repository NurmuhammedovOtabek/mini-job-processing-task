import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { MockService } from '../mock/mock.service';
import { TASK_QUEUE, DEAD_LETTER_QUEUE } from './constants';

@Processor(TASK_QUEUE)
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly mockService: MockService,
    @InjectQueue(DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    const { taskId } = job.data;

    await this.taskRepository.manager.transaction(async (manager) => {
      const task = await manager
        .createQueryBuilder(Task, 'task')
        .setLock('pessimistic_write', undefined, ['task'])
        .where('task.id = :id', { id: taskId })
        .andWhere('task.status != :processing', { processing: TaskStatus.PROCESSING })
        .andWhere('task.status != :cancelled', { cancelled: TaskStatus.CANCELLED })
        .getOne();

      if (!task) {
        this.logger.warn(`Task ${taskId} not found or already processing/cancelled, skipping`);
        return;
      }

      task.status = TaskStatus.PROCESSING;
      task.startedAt = new Date();
      task.attempts += 1;
      await manager.save(task);

      try {
        this.logger.log(`Processing task ${taskId} (attempt ${task.attempts})`);

        await this.mockService.processTask(task.payload);

        task.status = TaskStatus.COMPLETED;
        task.completedAt = new Date();
        task.lastError = null;
        await manager.save(task);

        this.logger.log(`Task ${taskId} completed successfully`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        task.lastError = errorMessage;

        const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

        if (isLastAttempt) {
          task.status = TaskStatus.FAILED;
          await this.deadLetterQueue.add('dead-letter', {
            taskId: task.id,
            type: task.type,
            payload: task.payload,
            error: errorMessage,
            attempts: task.attempts,
            failedAt: new Date().toISOString(),
          });
          this.logger.error(`Task ${taskId} failed permanently, moved to DLQ: ${errorMessage}`);
        } else {
          task.status = TaskStatus.PENDING;
          this.logger.warn(`Task ${taskId} failed, will retry: ${errorMessage}`);
        }

        await manager.save(task);
        throw error;
      }
    });
  }
}
