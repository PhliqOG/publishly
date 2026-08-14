'use strict';

class PublishlyApi {
  constructor() {
    this.name = 'publishlyApi';
    this.displayName = 'Publishly API';
    this.documentationUrl = 'https://github.com/publishly/publishly/blob/main/docs/API.md';
    this.properties = [
      {
        displayName: 'Backend URL',
        name: 'baseUrl',
        type: 'string',
        default: 'https://your-publishly.example',
        placeholder: 'https://api.example.com',
        description:
          'The public backend origin without /public/v1. HTTP is supported for local development.',
        required: true,
      },
      {
        displayName: 'Scoped API Key',
        name: 'apiKey',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        description:
          'A pub_ key with the scopes required by the selected operations.',
        required: true,
      },
    ];
    this.authenticate = {
      type: 'generic',
      properties: {
        headers: {
          Authorization: '={{$credentials.apiKey}}',
        },
      },
    };
    this.test = {
      request: {
        baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}',
        url: '/public/v1/is-connected',
        method: 'GET',
      },
    };
  }
}

module.exports = { PublishlyApi };
