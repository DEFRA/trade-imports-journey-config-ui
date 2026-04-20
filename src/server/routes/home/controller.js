/**
 * Redirect home to the explorer.
 */
export const homeController = {
  handler(_request, h) {
    return h.redirect('/explorer')
  }
}
