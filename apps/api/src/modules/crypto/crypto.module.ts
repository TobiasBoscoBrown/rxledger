import { Global, Module } from '@nestjs/common';
import { KmsService, LocalKmsService } from './kms.service';
import { FieldCipherService } from './field-cipher.service';
import { AppConfig } from '../../config/app-config';

@Global()
@Module({
  providers: [
    {
      provide: KmsService,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new LocalKmsService(config.kmsMasterKey),
    },
    FieldCipherService,
  ],
  exports: [KmsService, FieldCipherService],
})
export class CryptoModule {}
