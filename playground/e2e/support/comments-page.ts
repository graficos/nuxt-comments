import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Page object for the playground's comments UI.
 *
 * Selectors use the package's stable `data-nc-*` hooks; user-facing controls
 * are matched by accessible role/name (the default English messages). Scope
 * per-comment queries to the comment article and prefer the comment's *own*
 * footer, because nested replies live inside the same article.
 */
export class CommentsPage {
  constructor(readonly page: Page) {}

  async goto(resource: string) {
    await this.page.goto(resource)
    await expect(this.root).toBeVisible()
    await this.waitForHydration()
  }

  /**
   * Wait until Nuxt/Vue has hydrated. Playwright's actionability checks do not
   * wait for hydration, so a click can land on an SSR-rendered button before
   * its listener is attached. `useNuxtApp().isHydrating` is the precise signal;
   * fall back to Vue's mount marker.
   */
  async waitForHydration() {
    await this.page.waitForFunction(() => {
      const w = window as unknown as { useNuxtApp?: () => { isHydrating?: boolean } }
      if (typeof w.useNuxtApp === 'function') return w.useNuxtApp().isHydrating === false
      const el = document.getElementById('__nuxt') as (HTMLElement & { __vue_app__?: unknown }) | null
      return !!el?.__vue_app__
    })
  }

  get root(): Locator {
    return this.page.locator('[data-nc-comments-root]')
  }

  get listItems(): Locator {
    return this.page.locator('[data-nc-comments-list] > li')
  }

  get composer(): Locator {
    return this.page.locator('[data-nc-comment-composer]')
  }

  get bodyInput(): Locator {
    return this.composer.getByRole('textbox', { name: 'Comment body' })
  }

  get postButton(): Locator {
    return this.composer.getByRole('button', { name: 'Post', exact: true })
  }

  get loginPrompt(): Locator {
    return this.page.getByText('Sign in to comment:')
  }

  get loadMoreButton(): Locator {
    return this.page.getByRole('button', { name: 'Load more', exact: true })
  }

  comment(id: string): Locator {
    return this.page.locator(`[data-nc-comment-id="${id}"]`)
  }

  /** This comment's own body paragraph (not a nested reply's). */
  body(id: string): Locator {
    return this.comment(id).locator('p').first()
  }

  /** The comment's own reaction row (nested replies render their own). */
  private ownFooter(id: string): Locator {
    return this.comment(id).locator('[data-nc-comment-footer]').first()
  }

  reactionButton(id: string, type: string): Locator {
    return this.ownFooter(id).locator(`[data-nc-reaction-type="${type}"]`)
  }

  replyButton(id: string): Locator {
    return this.comment(id).getByRole('button', { name: `Reply to comment ${id}` })
  }

  editButton(id: string): Locator {
    return this.comment(id).getByRole('button', { name: `Edit comment ${id}` })
  }

  deleteButton(id: string): Locator {
    return this.comment(id).getByRole('button', { name: `Delete comment ${id}` })
  }

  viewRepliesButton(id: string): Locator {
    return this.comment(id).getByRole('button', { name: `Show replies to comment ${id}` })
  }

  async post(body: string) {
    await this.bodyInput.fill(body)
    await this.postButton.click()
  }

  async reply(parentId: string, body: string) {
    await this.replyButton(parentId).click()
    await this.bodyInput.fill(body)
    await this.postButton.click()
  }

  async edit(commentId: string, body: string) {
    await this.editButton(commentId).click()
    await this.bodyInput.fill(body)
    await this.postButton.click()
  }

  /** Click a reaction button (toggles add/remove based on current state). */
  async react(commentId: string, type: string) {
    await this.reactionButton(commentId, type).click()
  }

  async deleteComment(commentId: string) {
    await this.deleteButton(commentId).click()
  }

  async viewReplies(commentId: string) {
    await this.viewRepliesButton(commentId).click()
  }
}
