// Karma configuration
// Generated on Fri Jan 09 2015 20:41:58 GMT-0500 (EST)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],


    // list of files / patterns to load in the browser
    files: [
      '/usr/share/javascript/jquery/jquery.js',
      '/usr/share/javascript/angular.js/angular.js',
      '/usr/share/javascript/angular.js/angular-route.js',
      '/usr/share/javascript/angular.js/angular-mocks.js',
      '/usr/share/javascript/angular.js/angular-cookies.js',
      '/usr/share/javascript/angular.js/angular-sanitize.js',
      '../../src/maasserver/static/js/bundle/vendor-min.js',
      '../../src/maasserver/static/js/bundle/maas-min.js',
      '../../src/maasserver/static/js/angular/testing/*.js',
      '../../src/maasserver/static/js/angular/*/tests/test_*.js',
      '../../src/maasserver/static/partials/*.html'
    ],


    // list of files to exclude
    exclude: [
    ],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
        '../../src/maasserver/static/partials/*.html': ['ng-html2js'],
        '**/*.js': ['sourcemap']
    },

    ngHtml2JsPreprocessor: {
        // If your build process changes the path to your templates,
        // use stripPrefix and prependPrefix to adjust it.
        stripPrefix: ".*src/maasserver/",

        // the name of the Angular module to create
        moduleName: 'MAAS.templates'
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['failed'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['PhantomJS'],


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,


    // List of plugins to enable
    plugins: [
      'karma-jasmine',
      'karma-chrome-launcher',
      'karma-firefox-launcher',
      'karma-opera-launcher',
      'karma-phantomjs-launcher',
      'karma-failed-reporter',
      'karma-ng-html2js-preprocessor',
      'karma-sourcemap-loader'
    ]
  });
};
