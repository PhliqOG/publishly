import { NewsletterInterface } from '@gitroom/nestjs-libraries/newsletter/newsletter.interface';

export class ListmonkProvider implements NewsletterInterface {
  name = 'listmonk';
  async register(email: string) {
    const body = {
      email,
      status: 'enabled',
      lists: [+process.env.LISTMONK_LIST_ID].filter((f) => f),
    };

    const authString = `${process.env.LISTMONK_USER}:${process.env.LISTMONK_API_KEY}`;
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set(
      'Authorization',
      'Basic ' + Buffer.from(authString).toString('base64')
    );

    try {
      const subscriberResponse = await fetch(
        `${process.env.LISTMONK_DOMAIN}/api/subscribers`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }
      );
      if (!subscriberResponse.ok) {
        throw new Error(
          `Listmonk subscriber creation failed (HTTP ${subscriberResponse.status}).`
        );
      }
      const {
        data: { id },
      } = await subscriberResponse.json();
      if (!id) {
        throw new Error('Listmonk returned no subscriber identifier.');
      }

      const welcomeEmail = {
        subscriber_id: id,
        template_id: +process.env.LISTMONK_WELCOME_TEMPLATE_ID,
        subject: 'Welcome to Publishly',
      };

      const welcomeResponse = await fetch(
        `${process.env.LISTMONK_DOMAIN}/api/tx`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(welcomeEmail),
        }
      );
      if (!welcomeResponse.ok) {
        throw new Error(
          `Listmonk welcome delivery failed (HTTP ${welcomeResponse.status}).`
        );
      }
    } catch (error) {
      console.error({
        event: 'newsletter_registration_failed',
        code: 'newsletter_provider_unavailable',
        reason:
          error instanceof Error && error.message
            ? error.message
            : 'The newsletter provider failed without a reason.',
      });
    }
  }
}
