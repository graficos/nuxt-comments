import { describe, it, expect } from 'vitest'
import { defaultCommentsMessages, formatMessage } from '../../src/runtime/shared/messages'

describe('formatMessage', () => {
  it('returns the template unchanged when no params are given', () => {
    expect(formatMessage('Hello')).toBe('Hello')
  })

  it('interpolates {tokens}', () => {
    expect(formatMessage('Continue with {provider}', { provider: 'github' })).toBe('Continue with github')
  })

  it('supports multiple tokens and non-string values', () => {
    expect(formatMessage('{a} and {b}', { a: 'x', b: 2 })).toBe('x and 2')
  })

  it('leaves unknown tokens intact', () => {
    expect(formatMessage('Hi {name}', {})).toBe('Hi {name}')
  })
})

describe('defaultCommentsMessages', () => {
  it('uses tokens for the dynamic messages', () => {
    expect(defaultCommentsMessages.continueWith).toContain('{provider}')
    expect(defaultCommentsMessages.replyTo).toContain('{author}')
    expect(defaultCommentsMessages.reactWith).toContain('{type}')
    expect(defaultCommentsMessages.replyToComment).toContain('{id}')
    expect(defaultCommentsMessages.showReplies).toContain('{id}')
  })

  it('has a non-empty string for every message', () => {
    for (const value of Object.values(defaultCommentsMessages)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })
})
