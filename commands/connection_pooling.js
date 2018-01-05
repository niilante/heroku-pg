'use strict'

const co = require('co')
const cli = require('heroku-cli-util')

function * run (context, heroku) {
  const util = require('../lib/util')
  const fetcher = require('../lib/fetcher')(heroku)
  const {app, args, flags} = context

  let addon = yield heroku.get(`/addons/${encodeURIComponent(args.database)}`)

  let db = yield fetcher.addon(app, args.database)
  if (util.starterPlan(db)) throw new Error('This operation is not supported by Hobby tier databases.')

  function createAttachment (app, as, confirm, credential) {
    let body = {
      name: as,
      app: {name: app},
      addon: {name: addon.name},
      namespace: `connection-pooling:${credential || 'default'}`,
      confirm
    }
    return cli.action(
      `Attaching ${credential ? cli.color.addon(credential) + ' of ' : ''}${cli.color.addon(addon.name)}${as ? ' as ' + cli.color.attachment(as) : ''} to ${cli.color.app(app)}`,
      heroku.request({
        path: '/addon-attachments',
        method: 'POST',
        body: body
      })
    )
  }

  if (flags.credential && flags.credential !== 'default') {
    let credentialConfig = yield heroku.get(`/addons/${addon.name}/config/credential:${encodeURIComponent(flags.credential)}`)
    if (credentialConfig.length === 0) {
      throw new Error(`Could not find credential ${flags.credential} for database ${addon.name}`)
    }
    let poolingConfig = yield heroku.get(`/addons/${addon.name}/config/connection-pooling:${encodeURIComponent(flags.credential)}`)
    if (poolingConfig.length === 0) {
      throw new Error(`Could not find credential ${flags.credential} with connection pooling for database ${addon.name}`)
    }
  }

  let attachment = yield util.trapConfirmationRequired(app, flags.confirm, (confirm) => createAttachment(app, flags.as, confirm, flags.credential))

  yield cli.action(
    `Setting ${cli.color.attachment(attachment.name)} config vars and restarting ${cli.color.app(app)}`,
    {success: false},
    co(function * () {
      let releases = yield heroku.get(`/apps/${app}/releases`, {
        partial: true,
        headers: { 'Range': 'version ..; max=1, order=desc' }
      })
      cli.action.done(`done, v${releases[0].version}`)
    })
  )
}

module.exports = {
  topic: 'pg',
  command: 'connection-pooling:attach',
  description: 'add an attachment to a database using connection pooling',
  needsApp: true,
  needsAuth: true,
  help: `Example:

  heroku pg:connection-pooling:attach postgresql-something-12345 --credential cred-name
`,
  args: [{name: 'database', optional: true}],
  flags: [{name: 'credential', char: 'n', hasValue: true, required: false, description: 'name of the credential within the database'}],
  run: cli.command({preauth: true}, co.wrap(run))
}
