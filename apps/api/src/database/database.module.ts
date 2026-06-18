import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { AppConfig } from '../config/app-config';

@Global()
@Module({
  providers: [
    { provide: DatabaseService, inject: [AppConfig], useFactory: (c: AppConfig) => new DatabaseService(c) },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
