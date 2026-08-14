import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

export type PostValidationError = {
  /** Provider identifier, e.g. "x", "linkedin-page". */
  provider: string;
  /** Human readable provider name, e.g. "X", "LinkedIn Page". */
  name: string;
  /** The readable validation error. */
  error: string;
  failureClass: 'recoverable' | 'user_action_needed' | 'data_problem';
  code: string;
  reason: string;
};

export class PostValidationException extends HttpException {
  constructor(message: PostValidationError) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

@Catch(PostValidationException)
export class PostValidationExceptionFilter implements ExceptionFilter {
  catch(exception: PostValidationException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const { provider, name, error, failureClass, code, reason } =
      exception.getResponse() as PostValidationError;

    response.status(status).json({
      statusCode: status,
      provider,
      name,
      failureClass,
      code,
      reason,
      message: error || reason,
    });
  }
}
