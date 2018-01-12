'use strict'

const co = require('co')
const cli = require('heroku-cli-util')
const host = require('../lib/host')

function * run (context, heroku) {
  const util = require('../lib/util')
  const fetcher = require('../lib/fetcher')(heroku)
  const {app, args, flags} = context

  let db = yield fetcher.addon(app, args.database)
  let addon = yield heroku.get(`/addons/${encodeURIComponent(db.name)}`)
  let credential = `${flags.credential || 'default'}`

  if (util.starterPlan(db)) throw new Error('This operation is not supported by Hobby tier databases.')

  function activatePoolCredential(db, credential) {
    return heroku.request({
      host: host(db),
      method: 'POST',
      path: `/client/v11/databases/${db.name}/connection-pooling/credentials/${credential}`
    })
  }

  function createAttachment (addon, app, db, credential) {
    let attachmentParams = {
      app: { name: app },
      addon: { name: addon.name },
      namespace: `connection-pooling:${credential}`
    }

    return cli.action(
      `Enabling Connection Pooling for credential ${cli.color.addon(credential)} on ${cli.color.addon(addon.name)} to ${cli.color.app(app)}`,
      heroku.request({
        path: '/addon-attachments',
        method: 'POST',
        body: attachmentParams
      })
    )
  }

  let pool = yield activatePoolCredential(db, credential)
  let attachment = yield createAttachment(addon, app, db, credential)

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