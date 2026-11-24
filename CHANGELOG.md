# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). This file is generated at each
release from the Conventional Commits: never edit it by hand.

## [0.1.0] - 2026-11-24

### Added

- **devices:** the weather around a house of Gladys from the public Netatmo stations within a radius (median or mean): temperature, humidity, pressure, rain over 1 h and 24 h, wind, gust, direction, raining yes/no, stations used
- **stations:** the nearest public stations (up to 20) as devices, with the measures of their modules and their distance from home
- **scenes:** triggers when the rain starts and stops nearby; action to read the weather nearby now with another radius
- **widgets:** weather nearby, nearest stations, the neighborhood over the last 24 hours (temperature, humidity, pressure, wind, rain)
- **connection:** OAuth2 with the user's own Netatmo Connect application, rotating refresh token kept in Gladys
- **configuration:** house, radius (1 to 20 km), median or mean, stations offered, reading every 10 min to 1 h, language of the texts, "Read Netatmo now" button

[0.1.0]: https://github.com/William-De71/gladys-netatmo-public-weather/releases/tag/v0.1.0
