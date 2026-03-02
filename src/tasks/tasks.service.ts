import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { FilterTasksDto } from './dto/filter-tasks.dto';
import { PaginatedTasksResponseDto } from './dto/task-response.dto';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { TASK_QUEUE } from './constants';
import { Role } from '../users/enums/role.enum';

const PRIORITY_MAP: Record<TaskPriority, number> = {
  [TaskPriority.HIGH]: 1,
  [TaskPriority.NORMAL]: 2,
  [TaskPriority.LOW]: 3,
};

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectQueue(TASK_QUEUE)
    private readonly taskQueue: Queue,
  ) {}

  async create(
    dto: CreateTaskDto,
    userId: string,
  ): Promise<Task> {
    const existing = await this.taskRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existing) {
      throw new ConflictException('Task with this idempotency key already exists');
    }

    const task = this.taskRepository.create({
      userId,
      type: dto.type,
      priority: dto.priority ?? TaskPriority.NORMAL,
      payload: dto.payload,
      idempotencyKey: dto.idempotencyKey,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    });

    await this.taskRepository.save(task);

    let delay = 0;
    if (task.scheduledAt) {
      delay = Math.max(0, task.scheduledAt.getTime() - Date.now());
    }

    await this.taskQueue.add(
      task.type,
      { taskId: task.id },
      {
        jobId: task.id,
        priority: PRIORITY_MAP[task.priority],
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return task;
  }

  async cancel(
    taskId: string,
    userId: string,
    userRole: Role,
  ): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (userRole !== Role.ADMIN && task.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own tasks');
    }

    if (task.status !== TaskStatus.PENDING) {
      throw new ConflictException('Only PENDING tasks can be cancelled');
    }

    const job = await this.taskQueue.getJob(task.id);
    if (job) {
      await job.remove();
    }

    task.status = TaskStatus.CANCELLED;
    return this.taskRepository.save(task);
  }

  async findAll(
    dto: FilterTasksDto,
    userId: string,
    userRole: Role,
  ): Promise<PaginatedTasksResponseDto> {
    const qb = this.taskRepository.createQueryBuilder('task');

    if (userRole !== Role.ADMIN) {
      qb.andWhere('task.user_id = :userId', { userId });
    }

    if (dto.status) {
      qb.andWhere('task.status = :status', { status: dto.status });
    }

    if (dto.type) {
      qb.andWhere('task.type = :type', { type: dto.type });
    }

    if (dto.dateFrom) {
      qb.andWhere('task.created_at >= :dateFrom', { dateFrom: dto.dateFrom });
    }

    if (dto.dateTo) {
      qb.andWhere('task.created_at <= :dateTo', { dateTo: dto.dateTo });
    }

    qb.orderBy('task.created_at', 'DESC');

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async reprocess(taskId: string): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status !== TaskStatus.FAILED) {
      throw new ConflictException('Only FAILED tasks can be reprocessed');
    }

    task.status = TaskStatus.PENDING;
    task.lastError = null;
    await this.taskRepository.save(task);

    await this.taskQueue.add(
      task.type,
      { taskId: task.id },
      {
        jobId: `${task.id}-retry-${Date.now()}`,
        priority: PRIORITY_MAP[task.priority],
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return task;
  }
}
