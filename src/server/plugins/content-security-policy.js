import Blankie from 'blankie'

/**
 * Manage content security policies.
 * @satisfies {import('@hapi/hapi').Plugin}
 */
const contentSecurityPolicy = {
  plugin: Blankie,
  options: {
    // Hash 'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw=' is to support a GOV.UK frontend script bundled within Nunjucks macros
    // https://frontend.design-system.service.gov.uk/import-javascript/#if-our-inline-javascript-snippet-is-blocked-by-a-content-security-policy
    // Hash 'sha256-bffe/JHaQrZvstTLzQiU7K/Pr79yhWi2LWAq9qqbx5Q=' is the inline bootstrap script in hapi-swagger's /documentation
    // page that initialises the Swagger UI. If hapi-swagger updates and changes this script, recompute via:
    //   curl -s http://localhost:3000/documentation | python3 -c "import sys,re,hashlib,base64; s=re.search(r'<script>(.*?)</script>', sys.stdin.read(), re.S).group(1); print('sha256-'+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())"
    defaultSrc: ['self'],
    fontSrc: ['self', 'data:'],
    connectSrc: ['self', 'wss', 'data:'],
    mediaSrc: ['self'],
    styleSrc: ['self'],
    scriptSrc: [
      'self',
      "'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw='",
      "'sha256-bffe/JHaQrZvstTLzQiU7K/Pr79yhWi2LWAq9qqbx5Q='"
    ],
    imgSrc: ['self', 'data:'],
    frameSrc: ['self', 'data:'],
    objectSrc: ['none'],
    frameAncestors: ['none'],
    formAction: ['self'],
    manifestSrc: ['self'],
    generateNonces: false
  }
}

export { contentSecurityPolicy }
