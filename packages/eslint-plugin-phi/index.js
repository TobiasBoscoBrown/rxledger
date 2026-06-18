'use strict';

const requirePhiTag = require('./rules/require-phi-tag');

module.exports = {
  rules: {
    'require-phi-tag': requirePhiTag,
  },
  configs: {
    recommended: {
      plugins: ['@rxledger/phi'],
      rules: {
        '@rxledger/phi/require-phi-tag': 'error',
      },
    },
  },
};
