import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';

export const checkAuth = (
  inputData: any,
  context: any
) => {
  const auth = getAuth();
  const transportAuth = context?.mcp?.extra?.authInfo;
  const authInfo = auth || transportAuth?.organization || transportAuth;
  if (authInfo && context?.requestContext) {
    (context.requestContext as any).set(
      'organization',
      JSON.stringify(authInfo)
    );
    (context.requestContext as any).set('ui', 'false');
  }
};
