module.exports = process.env.CONTINUOUS_INTEGRATION ? [
    // CI-environment, include a range of different browsers

    // Desktop
    { 'browserName': 'firefox' }, // Latest firefox
    { 'browserName': 'firefox', 'version': 10 }, // Old firefox
    { 'browserName': 'chrome' }, // Latest chrome
    { 'browserName': 'chrome', 'version': 26 }, // Old chrome
    { 'browserName': 'safari', 'version': 7, 'platform': 'OS X 10.9' }, // Safari 7
    { 'browserName': 'opera', 'version': 12, 'platform': 'Windows 7'}, // Opera 12
    { 'browserName': 'internet explorer', 'version': 11, 'platform': 'Windows 7'}, // Internet Explorer 11
    { 'browserName': 'internet explorer', 'version': 8, 'platform': 'Windows 7'}, // Internet Explorer 8

    // Mobile (iOS not currently available due to limitations on SauceLabs)
    { // Android 4.4
        'platform': 'Linux',
        'browserName': 'android',
        'version': '4.4',
        'deviceName': 'Google Nexus 7 HD Emulator',
        'device-orientation': 'portrait'
    },
    { // Android 4.0
        'platform': 'Linux',
        'browserName': 'android',
        'version': '4.0',
        'deviceName': 'Samsung Galaxy S2 Emulator',
        'device-orientation': 'portrait'
    }
] : [
    // Non-CI environment, limit browsers
    { 'browserName': 'firefox' },
    { 'browserName': 'chrome' }
];