import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { FilterTasksDto } from './dto/filter-tasks.dto';
import { TaskResponseDto, PaginatedTasksResponseDto } from './dto/task-response.dto';
import { MetricsResponseDto } from './dto/metrics-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiCreatedResponse({ type: TaskResponseDto, description: 'Task created' })
  @ApiConflictResponse({ description: 'Idempotency key already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  create(
    @Body() dto: CreateTaskDto,
    @CurrentUser('userId') userId: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.create(dto, userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a PENDING task' })
  @ApiOkResponse({ type: TaskResponseDto, description: 'Task cancelled' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiConflictResponse({ description: 'Only PENDING tasks can be cancelled' })
  @ApiForbiddenResponse({ description: 'Cannot cancel other user tasks' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
  ): Promise<TaskResponseDto> {
    return this.tasksService.cancel(id, userId, role);
  }

  @Get()
  @ApiOperation({ summary: 'List tasks with filters and pagination' })
  @ApiOkResponse({ type: PaginatedTasksResponseDto })
  findAll(
    @Query() dto: FilterTasksDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
  ): Promise<PaginatedTasksResponseDto> {
    return this.tasksService.findAll(dto, userId, role);
  }

  @Get('metrics')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get task metrics (Admin only)' })
  @ApiOkResponse({ type: MetricsResponseDto })
  @ApiForbiddenResponse({ description: 'Admin only' })
  getMetrics(): Promise<MetricsResponseDto> {
    return this.tasksService.getMetrics();
  }

  @Post(':id/reprocess')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reprocess a FAILED task (Admin only)' })
  @ApiOkResponse({ type: TaskResponseDto, description: 'Task requeued' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiConflictResponse({ description: 'Only FAILED tasks can be reprocessed' })
  @ApiForbiddenResponse({ description: 'Admin only' })
  reprocess(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.reprocess(id);
  }
}
