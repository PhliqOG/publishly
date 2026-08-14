import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export const loadSwagger = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('Publishly API')
    .setDescription('Publishly application and integration API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
};
