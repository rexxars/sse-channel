# Change Log
All notable changes to this project will be documented in this file.

## [4.0.0] - 2020-11-19
- BREAKING: Only support Node v10 and higher
- BREAKING: Remove CORS-handling - use `cors` module or similar

## [3.1.0] - 2018-06-06
### Added
- Add ability to disable CORS-checking by passing `false` as the `cors` option

## [3.0.0] - 2017-11-27
- BREAKING: Only support Node v4 and higher

## [2.0.6] - 2017-03-29
### Fixed
- Stop "keep-alive" ping when calling `close()` on a channel

## [2.0.5] - 2017-02-10
### Fixed
- Fixed `flush()` deprecation warnings

## 2.0.4 - 2017-02-10
### Changed
- Content-Type header now includes charset (UTF-8)

## 2.0.3 - 2016-12-11
### Fixed
- Make connection count more reliable (William Neely)

## [2.0.0] - 2015-07-23
### Changed
- `jsonEncode` will now encode any message (previously, specifying a string to `send` would send a non-JSON encoded string)
- `addClient()` callback is now asyncronous in all cases, and provides an `Error` instance on CORS-failure
- `sendMissedEvents()` is renamed to `sendEventsSinceId()`
- `message` event now provides `channel` as first argument to listeners, to be consistent with `connect` and `disconnect` events

### Added
- A much richer README with proper documentation for options, methods and events
- Examples of usage with Node.js HTTP server, express.js and hapi

## [1.0.6] - 2015-07-23
### Fixed
- Call `flush()` on response object if it exists, fixes compression middleware in express

## [1.0.4] - 2015-02-03
### Fixed
- Use `0` instead of `Infinity` for socket timeouts.

### Added
- Changelog!

[4.0.0]: https://github.com/rexxars/sse-channel/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/rexxars/sse-channel/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/rexxars/sse-channel/compare/v2.0.6...v3.0.0
[2.0.6]: https://github.com/rexxars/sse-channel/compare/v2.0.5...v2.0.6
[2.0.5]: https://github.com/rexxars/sse-channel/compare/v2.0.4...v2.0.5
[2.0.0]: https://github.com/rexxars/sse-channel/compare/1.0.6...2.0.0
[1.0.6]: https://github.com/rexxars/sse-channel/compare/1.0.4...1.0.6
[1.0.4]: https://github.com/rexxars/sse-channel/compare/1.0.3...1.0.4
