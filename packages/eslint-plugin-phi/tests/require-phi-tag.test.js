'use strict';

const test = require('node:test');
const { RuleTester } = require('eslint');
const rule = require('../rules/require-phi-tag');

// Run RuleTester assertions synchronously inside node:test.
RuleTester.describe = (_t, fn) => fn();
RuleTester.it = (_t, fn) => fn();
RuleTester.itOnly = (_t, fn) => fn();

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

test('require-phi-tag', () => {
  ruleTester.run('require-phi-tag', rule, {
    valid: [
      // Tagged PHI field passes.
      { code: `z.object({ diagnosis: phi(z.string()) })` },
      // Tagged + chained modifiers still passes.
      { code: `z.object({ dosage: phi(z.string()).optional() })` },
      // Non-PHI fields are ignored.
      { code: `z.object({ shippingState: z.string().length(2) })` },
      // Not a z.object call — ignored.
      { code: `something({ ssn: z.string() })` },
      // Custom additional key, tagged.
      {
        code: `z.object({ memberId: phi(z.string()) })`,
        options: [{ additionalKeys: ['memberId'] }],
      },
    ],
    invalid: [
      {
        code: `z.object({ diagnosis: z.string() })`,
        errors: [{ messageId: 'untagged', data: { name: 'diagnosis' } }],
      },
      {
        code: `z.object({ dateOfBirth: z.string().optional() })`,
        errors: [{ messageId: 'untagged' }],
      },
      {
        // snake_case normalization
        code: `z.object({ clinician_notes: z.string() })`,
        errors: [{ messageId: 'untagged' }],
      },
      {
        // pattern-based detection
        code: `z.object({ patientWeight: z.number() })`,
        options: [{ patterns: ['weight$'] }],
        errors: [{ messageId: 'untagged' }],
      },
    ],
  });
});
