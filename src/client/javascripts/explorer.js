/**
 * Obligation Explorer - Client-side JavaScript
 *
 * Provides a live JSON editor that evaluates obligations in real-time
 * and communicates results to landscape and trace panels.
 *
 * Architecture: Event-driven panel communication using custom events.
 */

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Generic debounce utility
 * @param {Function} fn - Function to debounce
 * @param {number} delayMs - Delay in milliseconds
 * @returns {Function} - Debounced function with .cancel() method
 */
const debounce = (fn, delayMs) => {
  let timeoutId = null

  const debounced = (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delayMs)
  }

  debounced.cancel = () => clearTimeout(timeoutId)
  return debounced
}

// ---------------------------------------------------------------------------
// Input Validation
// ---------------------------------------------------------------------------

/**
 * Validate evaluation result structure
 * @param {*} result - Alleged evaluation result
 * @returns {{ valid: boolean, error?: string }}
 */
const validateEvaluationResult = (result) => {
  if (!result || typeof result !== 'object') {
    return { valid: false, error: 'Result must be an object' }
  }

  if (!result.summary || typeof result.summary !== 'object') {
    return { valid: false, error: 'Result.summary must be an object' }
  }

  const requiredSummaryFields = ['satisfied', 'unsatisfied', 'deferred', 'inactive', 'total', 'submittable']
  for (const field of requiredSummaryFields) {
    if (!(field in result.summary)) {
      return { valid: false, error: `Result.summary.${field} is required` }
    }
  }

  if (typeof result.summary.submittable !== 'boolean') {
    return { valid: false, error: 'Result.summary.submittable must be boolean' }
  }

  if (!Array.isArray(result.obligations)) {
    return { valid: false, error: 'Result.obligations must be an array' }
  }

  return { valid: true }
}

/**
 * Validate obligation structure
 * @param {*} obligation - Alleged obligation object
 * @returns {boolean}
 */
const isValidObligation = (obligation) => {
  if (!obligation || typeof obligation !== 'object') return false
  if (typeof obligation.id !== 'string') return false

  const validStatuses = ['satisfied', 'unsatisfied', 'deferred', 'inactive']
  if (!validStatuses.includes(obligation.status)) return false

  return true
}

/**
 * Validate trace step structure
 * @param {*} step - Alleged trace step
 * @returns {boolean}
 */
const isValidTraceStep = (step) => {
  if (!step || typeof step !== 'object') return false
  if (typeof step.step !== 'string') return false
  return true
}

/**
 * Sanitize text for safe DOM insertion
 * @param {*} value - Value to sanitize
 * @returns {string} - Safe text string
 */
const sanitizeText = (value) => {
  if (value === null || value === undefined) return 'null'
  return String(value)
}

// ---------------------------------------------------------------------------
// Transformation & Parsing
// ---------------------------------------------------------------------------

/**
 * Parse JSON string with error handling
 * @param {string} jsonString - Raw textarea content
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
const parseJSON = (jsonString) => {
  if (!jsonString.trim()) {
    return { success: true, data: {} }
  }

  try {
    const data = JSON.parse(jsonString)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Format object as pretty-printed JSON string
 * @param {*} data - Object to format
 * @param {number} spaces - Indentation (default: 2)
 * @returns {string} - Pretty-printed JSON
 */
const formatJSON = (data, spaces = 2) => {
  return JSON.stringify(data, null, spaces) + '\n'
}

/**
 * Build request payload for evaluation endpoint
 * @param {Object} notificationData - Parsed notification object
 * @returns {Object} - { notification: notificationData }
 */
const buildEvaluationPayload = (notificationData) => {
  return { notification: notificationData }
}

// ---------------------------------------------------------------------------
// Data Fetching
// ---------------------------------------------------------------------------

/**
 * POST /explorer/debug/evaluate with notification JSON
 * @param {Object} notification - Parsed notification object
 * @returns {Promise<Object>} - { summary, obligations, trace }
 * @throws {Error} - Network, validation, or parsing errors
 */
const evaluateNotification = async (notification) => {
  try {
    const response = await fetch('/explorer/debug/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildEvaluationPayload(notification))
    })

    if (!response.ok) {
      throw new Error(`Evaluation failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()

    // Validate response structure
    const validation = validateEvaluationResult(result)
    if (!validation.valid) {
      throw new Error(`Invalid evaluation result: ${validation.error}`)
    }

    return result
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to evaluate notification. Check your connection.')
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// DOM Rendering
// ---------------------------------------------------------------------------

/**
 * Render error notification in a panel
 * @param {HTMLElement} panel - Panel element
 * @param {string} errorMessage - Error message text
 * @returns {void}
 */
const renderErrorInPanel = (panel, errorMessage) => {
  if (!panel) return

  panel.textContent = '' // Clear existing content

  const errorDiv = document.createElement('div')
  errorDiv.className = 'govuk-error-summary'
  errorDiv.setAttribute('aria-labelledby', 'error-summary-title')
  errorDiv.setAttribute('role', 'alert')

  const title = document.createElement('h2')
  title.className = 'govuk-error-summary__title'
  title.id = 'error-summary-title'
  title.textContent = 'There is a problem'

  const errorBody = document.createElement('div')
  errorBody.className = 'govuk-error-summary__body'

  const errorText = document.createElement('p')
  errorText.className = 'govuk-body'
  errorText.textContent = sanitizeText(errorMessage)

  errorBody.appendChild(errorText)
  errorDiv.appendChild(title)
  errorDiv.appendChild(errorBody)
  panel.appendChild(errorDiv)
}

/**
 * Render parse error message below textarea
 * @param {string} errorMessage - Error text
 * @returns {void}
 */
const renderParseError = (errorMessage) => {
  clearParseError() // Remove any existing error first

  const textarea = document.getElementById('editor-textarea')
  const errorPara = document.createElement('p')
  errorPara.id = 'editor-error'
  errorPara.className = 'govuk-error-message'

  const visuallyHidden = document.createElement('span')
  visuallyHidden.className = 'govuk-visually-hidden'
  visuallyHidden.textContent = 'Error:'

  errorPara.appendChild(visuallyHidden)
  errorPara.appendChild(document.createTextNode(' ' + errorMessage))

  textarea.insertAdjacentElement('afterend', errorPara)
}

/**
 * Remove parse error message from DOM
 * @returns {void}
 */
const clearParseError = () => {
  const existing = document.getElementById('editor-error')
  if (existing) {
    existing.remove()
  }
}

/**
 * Render collapsible JSON editor inside a <details> element,
 * with a "Save & Evaluate" button that explicitly persists to session.
 * @returns {void}
 */
const renderCollapsibleEditor = () => {
  const panel = document.getElementById('editor-panel')

  const details = document.createElement('details')
  details.className = 'govuk-details govuk-!-margin-bottom-4'

  const summary = document.createElement('summary')
  summary.className = 'govuk-details__summary'

  const summaryText = document.createElement('span')
  summaryText.className = 'govuk-details__summary-text'
  summaryText.textContent = 'Notification JSON'

  summary.appendChild(summaryText)
  details.appendChild(summary)

  const detailsBody = document.createElement('div')
  detailsBody.className = 'govuk-details__text'

  const textarea = document.createElement('textarea')
  textarea.id = 'editor-textarea'
  textarea.className = 'govuk-textarea govuk-!-font-size-14'
  textarea.rows = 20
  textarea.spellcheck = false

  detailsBody.appendChild(textarea)

  // Button row: Save & Evaluate
  const buttonRow = document.createElement('div')
  buttonRow.className = 'govuk-!-margin-top-2'

  const saveButton = document.createElement('button')
  saveButton.id = 'save-evaluate-button'
  saveButton.type = 'button'
  saveButton.className = 'govuk-button'
  saveButton.dataset.module = 'govuk-button'
  saveButton.textContent = 'Save & Evaluate'

  const statusSpan = document.createElement('span')
  statusSpan.id = 'save-status'
  statusSpan.className = 'govuk-body-s'
  statusSpan.style.marginLeft = '12px'
  statusSpan.style.display = 'none'

  buttonRow.appendChild(saveButton)
  buttonRow.appendChild(statusSpan)
  detailsBody.appendChild(buttonRow)

  details.appendChild(detailsBody)
  panel.appendChild(details)
}

// ---------------------------------------------------------------------------
// Event Handling
// ---------------------------------------------------------------------------

/**
 * Notify other panels of evaluation result
 * @param {Object} result - Evaluation result
 * @param {Object} notification - Notification that was evaluated
 * @returns {void}
 */
const notifyPanels = (result, notification) => {
  const event = new CustomEvent('obligation-evaluation', {
    detail: { result, notification }
  })
  document.dispatchEvent(event)
}

/**
 * Perform evaluation and notify panels
 * @param {Object} notification - Notification to evaluate
 * @returns {Promise<void>}
 */
const evaluateAndNotify = async (notification) => {
  try {
    const result = await evaluateNotification(notification)
    notifyPanels(result, notification)
  } catch (error) {
    console.error('Evaluation failed:', error)

    // Show error in landscape and trace panels
    const landscapePanel = document.getElementById('landscape-panel')
    const tracePanel = document.getElementById('trace-panel')

    const errorMessage = error.message || 'An unexpected error occurred during evaluation'
    renderErrorInPanel(landscapePanel, errorMessage)
    renderErrorInPanel(tracePanel, errorMessage)
  }
}

/**
 * Show brief status text next to the save button.
 * Auto-hides after a short delay.
 *
 * @param {string} message - Text to display
 * @param {boolean} isError - True for error styling
 */
const showSaveStatus = (message, isError = false) => {
  const statusSpan = document.getElementById('save-status')
  if (!statusSpan) return

  statusSpan.textContent = message
  statusSpan.style.color = isError ? '#d4351c' : '#00703c'
  statusSpan.style.display = 'inline'

  setTimeout(() => {
    statusSpan.style.display = 'none'
  }, 3000)
}

/**
 * Attach event handlers to textarea and save button.
 * - Button click: immediate evaluate + save to session + visual feedback
 * - Ctrl+Enter: same as button
 * - Textarea input: debounced evaluate (live preview, also saves)
 *
 * @returns {Function} - Cleanup function to cancel debounce
 */
const attachEventHandlers = () => {
  const textarea = document.getElementById('editor-textarea')
  const saveButton = document.getElementById('save-evaluate-button')

  // Shared evaluation logic
  const evaluate = async ({ showFeedback = false } = {}) => {
    const parsed = parseJSON(textarea.value)

    if (!parsed.success) {
      renderParseError(parsed.error)
      if (showFeedback) showSaveStatus('Invalid JSON', true)
      return
    }

    clearParseError()

    try {
      await evaluateAndNotify(parsed.data)
      if (showFeedback) showSaveStatus('Saved to session')
    } catch {
      if (showFeedback) showSaveStatus('Save failed', true)
    }
  }

  // Textarea input (debounced — live preview while typing)
  const debouncedEvaluate = debounce(() => evaluate(), 300)
  textarea.addEventListener('input', debouncedEvaluate)

  // Save button — immediate evaluate with feedback
  const handleSaveClick = () => {
    debouncedEvaluate.cancel()
    evaluate({ showFeedback: true })
  }
  if (saveButton) {
    saveButton.addEventListener('click', handleSaveClick)
  }

  // Ctrl+Enter — immediate evaluate with feedback
  const handleKeydown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      debouncedEvaluate.cancel()
      evaluate({ showFeedback: true })
    }
  }
  textarea.addEventListener('keydown', handleKeydown)

  // Return cleanup function
  return () => {
    debouncedEvaluate.cancel()
    textarea.removeEventListener('keydown', handleKeydown)
    if (saveButton) saveButton.removeEventListener('click', handleSaveClick)
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Main entry point — called on DOMContentLoaded
 * @returns {Promise<void>}
 */
const initializeEditor = async () => {
  const editorPanel = document.getElementById('editor-panel')
  const landscapePanel = document.getElementById('landscape-panel')
  const tracePanel = document.getElementById('trace-panel')

  if (!editorPanel) {
    console.error('Editor panel not found')
    return
  }

  try {
    // Render collapsible JSON editor
    renderCollapsibleEditor()

    // Check for session notification passed from the journey page
    const gridRow = document.querySelector('[data-initial-notification]')
    const sessionNotification = gridRow
      ? (() => {
          try {
            return JSON.parse(gridRow.dataset.initialNotification)
          } catch {
            return null
          }
        })()
      : null

    // Use session notification if available, otherwise empty object
    const initialNotification = sessionNotification || {}

    const textarea = document.getElementById('editor-textarea')
    textarea.value = formatJSON(initialNotification)

    // Attach event handlers
    const cleanup = attachEventHandlers()

    // Register cleanup on page unload
    window.addEventListener('beforeunload', cleanup)

    // Trigger initial evaluation
    await evaluateAndNotify(initialNotification)
  } catch (error) {
    console.error('Failed to initialize explorer:', error)

    const errorMessage = error.message || 'Failed to initialize the Obligation Explorer'
    renderErrorInPanel(editorPanel, errorMessage)
    renderErrorInPanel(landscapePanel, errorMessage)
    renderErrorInPanel(tracePanel, errorMessage)
  }
}

// ---------------------------------------------------------------------------
// Landscape Panel
// ---------------------------------------------------------------------------

/**
 * GOV.UK colour constants (avoid inline styles where possible,
 * but these are needed for dynamic DOM elements)
 */
const GOVUK_GREEN = '#00703c'
const GOVUK_RED = '#d4351c'

/**
 * Map obligation status to GOV.UK tag colour class
 * @param {string} status - Obligation status (satisfied, unsatisfied, deferred, inactive)
 * @returns {string} - GOV.UK tag class
 */
const statusToTagClass = (status) => {
  const mapping = {
    satisfied: 'govuk-tag--green',
    unsatisfied: 'govuk-tag--red',
    deferred: 'govuk-tag--yellow',
    inactive: 'govuk-tag--grey'
  }
  return mapping[status] || ''
}

/**
 * Transform obligation ID to readable name (hyphen-to-space, title case)
 * @param {string} id - Obligation ID (e.g., "animal-identification")
 * @returns {string} - Readable name (e.g., "Animal Identification")
 */
const formatObligationId = (id) => {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Group obligations by status
 * @param {Array} obligations - List of obligations with status
 * @returns {Object} - { satisfied: [], unsatisfied: [], deferred: [], inactive: [] }
 */
const groupByStatus = (obligations) => {
  return obligations.reduce((groups, obligation) => {
    const status = obligation.status
    if (!groups[status]) groups[status] = []
    groups[status].push(obligation)
    return groups
  }, {})
}

/**
 * Create a status tag element
 * @param {string} className - Tag CSS class
 * @param {string} text - Tag text content
 * @returns {HTMLElement} - Strong tag element
 */
const createStatusTag = (className, text) => {
  const tag = document.createElement('strong')
  tag.className = `govuk-tag ${className}`
  tag.textContent = sanitizeText(text)
  return tag
}

/**
 * Render summary bar with counts — tags spaced with margins
 * @param {Object} summary - { satisfied, unsatisfied, deferred, inactive, total, submittable }
 * @returns {HTMLElement} - Summary bar DOM element
 */
const renderSummaryBar = (summary) => {
  const container = document.createElement('div')
  container.className = 'govuk-!-margin-bottom-4'

  const heading = document.createElement('h2')
  heading.className = 'govuk-heading-m'
  heading.textContent = 'Summary'

  const bodyDiv = document.createElement('div')

  const tags = [
    createStatusTag('govuk-tag--green', `${summary.satisfied} Satisfied`),
    createStatusTag('govuk-tag--red', `${summary.unsatisfied} Unsatisfied`),
    createStatusTag('govuk-tag--yellow', `${summary.deferred} Deferred`),
    createStatusTag('govuk-tag--grey', `${summary.inactive} Inactive`),
    summary.submittable
      ? createStatusTag('govuk-tag--green', 'Submittable')
      : createStatusTag('govuk-tag--red', 'Not submittable')
  ]

  tags.forEach((tag) => {
    tag.style.marginRight = '8px'
    tag.style.marginBottom = '4px'
    tag.style.display = 'inline-block'
    bodyDiv.appendChild(tag)
  })

  container.appendChild(heading)
  container.appendChild(bodyDiv)

  return container
}

/**
 * Render a single obligation row with tag + name in consistent font
 * @param {Object} obligation - Obligation with status and id
 * @returns {HTMLElement} - Obligation row DOM element
 */
const renderObligation = (obligation) => {
  if (!isValidObligation(obligation)) {
    console.warn('Invalid obligation:', obligation)
    return document.createTextNode('')
  }

  const container = document.createElement('div')
  container.className = 'govuk-!-margin-bottom-2'
  container.dataset.obligationId = sanitizeText(obligation.id)

  const tagClass = statusToTagClass(obligation.status)
  const statusTag = createStatusTag(tagClass, obligation.status)

  const readableName = formatObligationId(obligation.id)
  const nameSpan = document.createElement('span')
  nameSpan.className = 'govuk-body-s'
  nameSpan.style.display = 'inline'
  nameSpan.style.marginLeft = '6px'
  nameSpan.style.marginBottom = '0'
  nameSpan.textContent = readableName

  container.appendChild(statusTag)
  container.appendChild(nameSpan)

  return container
}

/**
 * Render a status group (e.g., "Satisfied" section with list of obligations)
 * @param {string} statusName - Status name (satisfied, unsatisfied, etc.)
 * @param {Array} obligations - List of obligations in this status
 * @returns {HTMLElement|null} - Status group DOM element or null if empty
 */
const renderStatusGroup = (statusName, obligations) => {
  if (!obligations || obligations.length === 0) return null

  const container = document.createElement('div')
  container.className = 'govuk-!-margin-bottom-6'

  const heading = document.createElement('h3')
  heading.className = 'govuk-heading-s'
  const readableStatus = statusName.charAt(0).toUpperCase() + statusName.slice(1)
  heading.textContent = `${readableStatus} (${obligations.length})`

  container.appendChild(heading)

  obligations.forEach((obligation) => {
    const obligationElement = renderObligation(obligation)
    if (obligationElement) {
      container.appendChild(obligationElement)
    }
  })

  return container
}

/**
 * Render landscape panel with evaluation result
 * @param {Object} result - { summary, obligations }
 * @returns {void}
 */
const renderLandscape = (result) => {
  const panel = document.getElementById('landscape-panel')
  if (!panel) {
    console.warn('Landscape panel not found')
    return
  }

  // Validate result
  const validation = validateEvaluationResult(result)
  if (!validation.valid) {
    renderErrorInPanel(panel, `Invalid evaluation result: ${validation.error}`)
    return
  }

  // Clear panel
  panel.textContent = ''

  // Create heading
  const heading = document.createElement('h2')
  heading.className = 'govuk-heading-m'
  heading.textContent = 'Obligations'
  panel.appendChild(heading)

  // Add summary bar
  const summaryBar = renderSummaryBar(result.summary)
  panel.appendChild(summaryBar)

  // Group obligations by status
  const grouped = groupByStatus(result.obligations)

  // Render each status group
  const statusOrder = ['satisfied', 'unsatisfied', 'deferred', 'inactive']
  statusOrder.forEach((status) => {
    const group = renderStatusGroup(status, grouped[status])
    if (group) {
      panel.appendChild(group)
    }
  })
}

// ---------------------------------------------------------------------------
// Trace Panel
// ---------------------------------------------------------------------------

/**
 * Create a trace step element for 'extract-fact' type
 * @param {Object} step - Trace step with fact and value
 * @returns {HTMLElement}
 */
const renderExtractFactStep = (step) => {
  const div = document.createElement('div')
  div.className = 'govuk-body-s'

  div.appendChild(document.createTextNode('Extract fact: '))

  const strong = document.createElement('strong')
  strong.textContent = sanitizeText(step.fact)
  div.appendChild(strong)

  div.appendChild(document.createTextNode(' = ' + sanitizeText(step.value)))

  return div
}

/**
 * Create a trace step element for 'apply-test' type
 * @param {Object} step - Trace step with test and result
 * @returns {HTMLElement}
 */
const renderApplyTestStep = (step) => {
  const div = document.createElement('div')
  div.className = 'govuk-body-s'

  div.appendChild(document.createTextNode('Apply test: '))

  const strong = document.createElement('strong')
  strong.textContent = sanitizeText(step.test)
  div.appendChild(strong)

  const resultText = step.result ? 'active' : 'inactive'
  div.appendChild(document.createTextNode(' \u2192 ' + resultText))

  return div
}

/**
 * Create a trace step element for 'deferred' type
 * @param {Object} step - Trace step with reason
 * @returns {HTMLElement}
 */
const renderDeferredStep = (step) => {
  const div = document.createElement('div')
  div.className = 'govuk-body-s'
  div.textContent = 'Deferred: ' + sanitizeText(step.reason)
  return div
}

/**
 * Create a trace step element for 'inactive' type
 * @param {Object} step - Trace step with reason
 * @returns {HTMLElement}
 */
const renderInactiveStep = (step) => {
  const div = document.createElement('div')
  div.className = 'govuk-body-s'
  div.textContent = 'Inactive: ' + sanitizeText(step.reason)
  return div
}

/**
 * Create a trace step element for 'satisfaction-check' type
 * Shows per-path satisfaction with colour coding (no glyphs)
 * @param {Object} step - Trace step with paths, missing, and pathDetails
 * @returns {HTMLElement}
 */
const renderSatisfactionCheckStep = (step) => {
  const div = document.createElement('div')
  div.className = 'govuk-body-s govuk-!-margin-bottom-2'

  const summaryLine = document.createElement('div')
  summaryLine.textContent = `Satisfaction check: ${sanitizeText(step.paths)} paths, ${sanitizeText(step.missing)} missing`
  div.appendChild(summaryLine)

  // Show individual path statuses when pathDetails are available
  if (step.pathDetails && step.pathDetails.length > 0) {
    const pathList = document.createElement('ul')
    pathList.className = 'govuk-list govuk-list--bullet govuk-!-font-size-14'
    step.pathDetails.forEach((detail) => {
      const li = document.createElement('li')
      li.textContent = sanitizeText(detail.path)
      li.style.color = detail.satisfied ? GOVUK_GREEN : GOVUK_RED
      pathList.appendChild(li)
    })
    div.appendChild(pathList)
  }

  return div
}

/**
 * Create a trace step element for 'action-check' type
 * @param {Object} step - Trace step with satisfied and reason
 * @returns {HTMLElement}
 */
const renderActionCheckStep = (step) => {
  const div = document.createElement('div')
  div.className = 'govuk-body-s'
  const statusText = step.satisfied ? 'completed' : 'pending'
  div.textContent = `Action check: ${statusText} - ${sanitizeText(step.reason)}`
  return div
}

/**
 * Render a single trace step
 * @param {Object} step - Trace step object
 * @returns {HTMLElement} - Trace step DOM element
 */
const renderTraceStep = (step) => {
  if (!isValidTraceStep(step)) {
    const div = document.createElement('div')
    div.className = 'govuk-body-s'
    div.textContent = 'Invalid trace step'
    return div
  }

  switch (step.step) {
    case 'extract-fact':
      return renderExtractFactStep(step)
    case 'apply-test':
      return renderApplyTestStep(step)
    case 'deferred':
      return renderDeferredStep(step)
    case 'inactive':
      return renderInactiveStep(step)
    case 'satisfaction-check':
      return renderSatisfactionCheckStep(step)
    case 'action-check':
      return renderActionCheckStep(step)
    default: {
      const div = document.createElement('div')
      div.className = 'govuk-body-s'
      div.textContent = 'Unknown step: ' + sanitizeText(step.step)
      return div
    }
  }
}

/**
 * Render trace for a single obligation.
 * Uses same tag + name pattern as the landscape panel for font consistency.
 * @param {Object} obligation - Obligation with trace data
 * @returns {HTMLElement} - Details element with trace steps
 */
const renderObligationTrace = (obligation) => {
  if (!isValidObligation(obligation)) {
    console.warn('Invalid obligation for trace:', obligation)
    return document.createTextNode('')
  }

  const details = document.createElement('details')
  details.className = 'govuk-details'

  const summary = document.createElement('summary')
  summary.className = 'govuk-details__summary'

  const summaryText = document.createElement('span')
  summaryText.className = 'govuk-details__summary-text'

  // Status tag
  const tagClass = statusToTagClass(obligation.status)
  const statusTag = createStatusTag(tagClass, obligation.status)
  summaryText.appendChild(statusTag)

  // Obligation name — explicit styling to match landscape panel
  const readableName = formatObligationId(obligation.id)
  const nameSpan = document.createElement('span')
  nameSpan.style.marginLeft = '6px'
  nameSpan.style.fontWeight = 'normal'
  nameSpan.style.fontSize = '16px'
  nameSpan.style.textDecoration = 'none'
  nameSpan.textContent = readableName
  summaryText.appendChild(nameSpan)

  summary.appendChild(summaryText)
  details.appendChild(summary)

  // Add trace steps
  const detailsText = document.createElement('div')
  detailsText.className = 'govuk-details__text'

  const traceSteps = obligation.trace?.steps || []

  if (traceSteps.length === 0) {
    const noTrace = document.createElement('p')
    noTrace.className = 'govuk-body-s'
    noTrace.textContent = 'No trace data available'
    detailsText.appendChild(noTrace)
  } else {
    traceSteps.forEach((step) => {
      const stepElement = renderTraceStep(step)
      detailsText.appendChild(stepElement)
    })
  }

  details.appendChild(detailsText)

  return details
}

/**
 * Render trace panel with evaluation trace
 * @param {Object} result - { obligations }
 * @returns {void}
 */
const renderTrace = (result) => {
  const panel = document.getElementById('trace-panel')
  if (!panel) {
    console.warn('Trace panel not found')
    return
  }

  // Validate result
  const validation = validateEvaluationResult(result)
  if (!validation.valid) {
    renderErrorInPanel(panel, `Invalid evaluation result: ${validation.error}`)
    return
  }

  // Clear panel
  panel.textContent = ''

  // Create heading
  const heading = document.createElement('h2')
  heading.className = 'govuk-heading-m'
  heading.textContent = 'Evaluation Trace'
  panel.appendChild(heading)

  // Render each obligation's trace
  result.obligations.forEach((obligation) => {
    const traceElement = renderObligationTrace(obligation)
    if (traceElement) {
      panel.appendChild(traceElement)
    }
  })
}

// ---------------------------------------------------------------------------
// Journey Page — auto-submit scenario form on dropdown change
// ---------------------------------------------------------------------------

const initializeScenarioForm = () => {
  const form = document.getElementById('scenario-form')
  if (!form) return

  const select = form.querySelector('select')
  if (!select) return

  select.addEventListener('change', () => {
    form.submit()
  })
}

// ---------------------------------------------------------------------------
// Debug Page — fragment explorer dropdown behaviour
// ---------------------------------------------------------------------------

const initializeFragmentExplorer = () => {
  const selector = document.getElementById('fragment-selector')
  if (!selector) return

  const display = document.getElementById('fragment-display')
  const textarea = document.getElementById('fragment-textarea')
  const noteEl = document.getElementById('fragment-note')

  const gridRow = document.querySelector('[data-fragments]')
  const fragments = gridRow ? JSON.parse(gridRow.dataset.fragments) : {}

  selector.addEventListener('change', () => {
    const obligationId = selector.value

    if (!obligationId || !fragments[obligationId]) {
      display.style.display = 'none'
      return
    }

    const fragmentData = fragments[obligationId]
    textarea.value = fragmentData.fragment

    if (fragmentData.note) {
      noteEl.textContent = fragmentData.note
      noteEl.style.display = 'block'
    } else {
      noteEl.textContent = ''
      noteEl.style.display = 'none'
    }

    display.style.display = 'block'
  })
}

// --- Main execution ---

// Initialize whichever page features are present
document.addEventListener('DOMContentLoaded', () => {
  initializeScenarioForm()
  initializeFragmentExplorer()
  initializeEditor()
})

// Listen for evaluation results and render landscape + trace panels
document.addEventListener('obligation-evaluation', (event) => {
  if (!event.detail || !event.detail.result) {
    console.error('Invalid obligation-evaluation event: missing result')
    return
  }

  const { result } = event.detail

  // Validate result before rendering
  const validation = validateEvaluationResult(result)
  if (!validation.valid) {
    console.error('Invalid evaluation result:', validation.error)

    const landscapePanel = document.getElementById('landscape-panel')
    const tracePanel = document.getElementById('trace-panel')
    renderErrorInPanel(landscapePanel, `Invalid evaluation result: ${validation.error}`)
    renderErrorInPanel(tracePanel, `Invalid evaluation result: ${validation.error}`)
    return
  }

  renderLandscape(result)
  renderTrace(result)
})
