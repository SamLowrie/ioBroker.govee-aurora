# Contributing

Issues and pull requests are welcome.

Please include the following when reporting a protocol or device issue:

- Projector model and firmware version, if available.
- The adapter version and ioBroker/js-controller version.
- Relevant adapter log output with IP addresses and account data removed.
- For payload work, the original Base64 frame list and a description of exactly
  one changed setting in Govee Home.

Do not share Govee account credentials, API keys, or unredacted network
captures.

Before opening a pull request, run:

```bash
npm ci
npm run check
npm test
```
