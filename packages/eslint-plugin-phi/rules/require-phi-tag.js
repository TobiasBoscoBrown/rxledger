'use strict';

/**
 * ESLint rule: require-phi-tag
 *
 * Fails the build when a field whose name looks like Protected Health
 * Information is declared inside a `z.object({ ... })` schema without being
 * wrapped in the `phi(...)` tag.
 *
 * Rationale (from the CollectiveOS JD): "PHI-tagged fields enforced by ESLint
 * rule." A naming heuristic can't *prove* a field is PHI, but it can guarantee
 * that the obvious ones are never shipped untagged by accident — the tag is
 * what the crypto and audit layers key off, so an untagged PHI field is an
 * un-encrypted, un-audited PHI field. Cheap guardrail, expensive failure mode.
 */

const DEFAULT_PHI_KEYS = [
  'dateofbirth',
  'dob',
  'ssn',
  'socialsecuritynumber',
  'diagnosis',
  'indication',
  'dosage',
  'medication',
  'medicalhistory',
  'chiefcomplaint',
  'cliniciannotes',
  'clinicalnotes',
  'phone',
  'phonenumber',
  'healthcondition',
  'labresult',
];

function keyName(prop) {
  if (!prop.key) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value;
  return null;
}

/** Recursively check whether an expression's call-chain includes a `phi(...)` call. */
function containsPhiCall(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'CallExpression') {
    if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'phi') {
      return true;
    }
    // Walk method-chain receivers, e.g. phi(z.string()).optional()
    if (node.callee && node.callee.type === 'MemberExpression') {
      return containsPhiCall(node.callee.object);
    }
  }
  if (node.type === 'MemberExpression') return containsPhiCall(node.object);
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require PHI-named fields in Zod object schemas to be tagged with phi().',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          additionalKeys: { type: 'array', items: { type: 'string' } },
          patterns: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      untagged:
        "Field '{{name}}' looks like PHI but is not wrapped in phi(). Untagged PHI is neither encrypted nor audited. Wrap it: phi(<schema>).",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const keys = new Set(
      DEFAULT_PHI_KEYS.concat(
        (options.additionalKeys || []).map((k) => String(k).toLowerCase()),
      ),
    );
    const patterns = (options.patterns || []).map((p) => new RegExp(p, 'i'));

    function looksLikePhi(name) {
      const normalized = name.toLowerCase().replace(/[_\s-]/g, '');
      if (keys.has(normalized)) return true;
      return patterns.some((re) => re.test(name));
    }

    function isZodObjectCall(node) {
      const callee = node.callee;
      return (
        callee &&
        callee.type === 'MemberExpression' &&
        callee.property &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'object'
      );
    }

    return {
      CallExpression(node) {
        if (!isZodObjectCall(node)) return;
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ObjectExpression') return;

        for (const prop of arg.properties) {
          if (prop.type !== 'Property') continue;
          const name = keyName(prop);
          if (!name || !looksLikePhi(name)) continue;
          if (!containsPhiCall(prop.value)) {
            context.report({ node: prop, messageId: 'untagged', data: { name } });
          }
        }
      },
    };
  },
};
