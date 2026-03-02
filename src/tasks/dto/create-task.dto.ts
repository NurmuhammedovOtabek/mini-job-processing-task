import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { TaskPriority } from '../enums/task-priority.enum';

export class CreateTaskDto {
  @ApiProperty({ example: 'email-sending' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.NORMAL })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ example: { to: 'user@example.com', subject: 'Hello' } })
  @IsObject()
  payload: Record<string, any>;

  @ApiProperty({ example: 'unique-key-123' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiPropertyOptional({ example: '2026-03-03T10:00:00Z' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
