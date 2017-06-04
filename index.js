/**
 * index.js - peddler
 * 
 * Licensed under Apache-2.0 license.
 * Copyright (C) 2017 Karim Alibhai.
 */

const fs = require('mz/fs')
    , path = require('path')
    , debug = require('debug')('peddler')

module.exports = async config => {
  if (!config || typeof config !== 'object') {
    throw new Error('Peddler requires a config object to be passed.')
  }

  /**
   * Hacky way of grabbing the app directory.
   */
  const appDirectory = process.argv[1]

  /**
   * Get app constructor via loader.
   */
  const App = typeof config.loader === 'object' && config.loader.hasOwnProperty('loader') ?
              config.loader.loader : config.loader

  /**
   * Create app.
   */
  const app = new App(config.loader.options || {})

  /**
   * Fix options.
   */
  config.directories = Object.assign({
    routes: 'routes',
    middleware: 'middleware'
  }, config.directories || {})

  /**
   * Fix paths.
   */
  for (let dir in config.directories) {
    if (config.directories.hasOwnProperty(dir)) {
      // skip absolute paths
      if (config.directories[dir][0] === '/') {
        continue
      }

      // make non-relative paths relative
      if (config.directories[dir][0] !== '.') {
        config.directories[dir] = './' + config.directories[dir]
      }

      // try searching for directories inside of app directory
      config.directories[dir] = path.resolve(appDirectory, config.directories[dir])
    }
  }

  /**
   * Load middleware from object.
   */
  for (let mw in config.middleware) {
    if (config.middleware.hasOwnProperty(mw)) {
      app.use(
        require(mw)(config.middleware[mw])
      )
    }
  }

  /**
   * Load middleware from directory.
   */
  ;(await fs.readdir(config.directories.middleware)).map(mod => {
    if (mod !== 'index.js') {
      debug('adding middleware: %s', mod.substr(0, mod.length - 3))
      app.use(require(path.join(config.directories.middleware, mod)).default)
    }
  })

  /**
   * Recursive route loader.
   */
  const load = function load(dir, route) {
    fs.readdirSync(dir).forEach(file => {
      if (file.endsWith('.js')) {
        let routeHandler = require(dir + '/' + file)

        // support for ES2015 modules
        if (typeof routeHandler === 'object' && routeHandler.hasOwnProperty('default')) {
          routeHandler = routeHandler.default
        }

        debug('adding route: %s %s', file.substr(0, file.length - 3), route.join('/'))

        app.add(
          file.substr(0, file.length - 3),
          '/' + route.join('/'),
          routeHandler
        )
      } else {
        load(dir + '/' + file, route.concat([
          (file[0] === '_' ? ':' : file[0]) + file.substr(1)
        ]))
      }
    })
  }

  // start route finder
  load(config.directories.routes, [])

  /**
   * Proxy events for logging.
   */
  const _emit = app.emit
  app.emit = function emit(eventName, eventData) {
    debug('event emitted: %s -> %j', eventName, eventData)
    return _emit.apply(this, arguments)
  }

  /**
   * Start up app.
   */
  app.bootstrap()
}