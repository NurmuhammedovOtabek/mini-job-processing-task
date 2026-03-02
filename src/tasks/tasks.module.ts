import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Task } from './entities/task.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskProcessor } from './task.processor';
import { MockModule } from '../mock/mock.module';
import { TASK_QUEUE, DEAD_LETTER_QUEUE } from './constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueue({ name: TASK_QUEUE }),
    BullModule.registerQueue({ name: DEAD_LETTER_QUEUE }),
    MockModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskProcessor],
  exports: [TasksService],
})
export class TasksModule {}
