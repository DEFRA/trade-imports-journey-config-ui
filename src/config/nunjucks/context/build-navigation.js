export function buildNavigation(request) {
  return [
    {
      text: 'Home',
      href: '/',
      current: request?.path === '/'
    },
    {
      text: 'Journey Selection',
      href: '/journey-selection',
      current: request?.path === '/journey-selection'
    }
  ]
}
