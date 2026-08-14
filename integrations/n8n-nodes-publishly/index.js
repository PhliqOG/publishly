'use strict';

module.exports = {
  ...require('./credentials/PublishlyApi.credentials'),
  ...require('./nodes/Publishly/Publishly.node'),
  ...require('./nodes/PublishlyTrigger/PublishlyTrigger.node'),
};
