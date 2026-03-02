import { ApiProperty } from '@nestjs/swagger';

export class StatusCountDto {
  @ApiProperty({ example: 'COMPLETED' })
  status: string;

  @ApiProperty({ example: 42 })
  count: number;
}

export class MetricsResponseDto {
  @ApiProperty({ example: 150 })
  totalTasks: number;

  @ApiProperty({ type: [StatusCountDto] })
  countsByStatus: StatusCountDto[];

  @ApiProperty({ example: 3245.5, description: 'Average processing time in ms' })
  avgProcessingTimeMs: number;
}
