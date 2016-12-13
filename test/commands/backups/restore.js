'use strict'
/* global describe it beforeEach afterEach context */

const cli = require('heroku-cli-util')
const expect = require('unexpected')
const nock = require('nock')

const addon = {name: 'postgres-1', plan: {name: 'heroku-postgresql:standard-0'}}

const cmd = require('../../../commands/backups/restore')

const shouldRestore = function (cmdRun) {
  let pg
  let api

  beforeEach(() => {
    api = nock('https://api.heroku.com')
    api.post('/actions/addon-attachments/resolve', {app: 'myapp', addon_attachment: 'DATABASE_URL'}).reply(200, [{addon}])

    pg = nock('https://postgres-api.heroku.com')
    cli.mockConsole()
  })

  afterEach(() => {
    nock.cleanAll()
    pg.done()
    api.done()
  })

  context('b005', () => {
    beforeEach(() => {
      pg.get('/client/v11/apps/myapp/transfers').reply(200, [
        {num: 5, from_type: 'pg_dump', to_type: 'gof3r', succeeded: true, to_url: 'https://myurl'}
      ])
      pg.post('/client/v11/databases/postgres-1/restores', {backup_url: 'https://myurl'}).reply(200, {
        num: 5,
        from_name: 'DATABASE',
        uuid: '100-001'
      })
      pg.get('/client/v11/apps/myapp/transfers/100-001').reply(200, {
        finished_at: '101',
        succeeded: true,
        logs: [{created_at: '100', message: 'log message 1'}]
      })
    })

    it('restores a db', () => {
      return cmdRun({app: 'myapp', args: {}, flags: {confirm: 'myapp'}})
      .then(() => expect(cli.stdout, 'to equal', `
Use Ctrl-C at any time to stop monitoring progress; the backup will continue restoring.
Use heroku pg:backups to check progress.
Stop a running restore with heroku pg:backups:cancel.

`))
      .then(() => expect(cli.stderr, 'to equal', `Starting restore of b005 to postgres-1... done
Restoring... pending
100 log message 1
Restoring... done
`))
    })

    it('shows verbose output', () => {
      return cmdRun({app: 'myapp', args: {}, flags: {confirm: 'myapp', verbose: true}})
      .then(() => expect(cli.stdout, 'to equal', `
Use Ctrl-C at any time to stop monitoring progress; the backup will continue restoring.
Use heroku pg:backups to check progress.
Stop a running restore with heroku pg:backups:cancel.

Restoring...
100 log message 1
`))
      .then(() => expect(cli.stderr, 'to equal', 'Starting restore of b005 to postgres-1... done\n'))
    })

    it('restores a specific db', () => {
      return cmdRun({app: 'myapp', args: {backup: 'b005'}, flags: {confirm: 'myapp'}})
      .then(() => expect(cli.stdout, 'to equal', `
Use Ctrl-C at any time to stop monitoring progress; the backup will continue restoring.
Use heroku pg:backups to check progress.
Stop a running restore with heroku pg:backups:cancel.

`))
      .then(() => expect(cli.stderr, 'to equal', `Starting restore of b005 to postgres-1... done
Restoring... pending
100 log message 1
Restoring... done
`))
    })

    it('restores a specific app db', () => {
      return cmdRun({app: 'myapp', args: {backup: 'myapp::b005'}, flags: {confirm: 'myapp'}})
      .then(() => expect(cli.stdout, 'to equal', `
Use Ctrl-C at any time to stop monitoring progress; the backup will continue restoring.
Use heroku pg:backups to check progress.
Stop a running restore with heroku pg:backups:cancel.

`))
      .then(() => expect(cli.stderr, 'to equal', `Starting restore of b005 to postgres-1... done
Restoring... pending
100 log message 1
Restoring... done
`))
    })
  })

  context('with a URL', () => {
    beforeEach(() => {
      pg.post('/client/v11/databases/postgres-1/restores', {backup_url: 'https://www.dropbox.com?dl=1'}).reply(200, {
        num: 5,
        from_name: 'DATABASE',
        uuid: '100-001'
      })
      pg.get('/client/v11/apps/myapp/transfers/100-001').reply(200, {
        finished_at: '101',
        succeeded: true,
        logs: []
      })
    })

    it('restores a db from a URL', () => {
      return cmdRun({app: 'myapp', args: {backup: 'https://www.dropbox.com'}, flags: {confirm: 'myapp'}})
      .then(() => expect(cli.stdout, 'to equal', `
Use Ctrl-C at any time to stop monitoring progress; the backup will continue restoring.
Use heroku pg:backups to check progress.
Stop a running restore with heroku pg:backups:cancel.

`))
      .then(() => expect(cli.stderr, 'to equal', `Starting restore of https://www.dropbox.com to postgres-1... done
Restoring... pending
Restoring... done
`))
    })
  })
}

describe('pg:backups:restore', () => {
  shouldRestore((args) => cmd.run(args))
})

describe('pg:backups restore', () => {
  shouldRestore(require('./helpers.js').dup('restore', cmd))
})