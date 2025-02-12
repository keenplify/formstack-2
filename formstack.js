/* global axios */
/* global embedId */
/* global middleware */
/* global baseApiInterceptor */

// Links here will be added to Formstack's CSP
// https://*.dynamicdataconcepts.com
// https://*.graphiteeducation.com

const VALUE_DIFFERENT = 'GE_FORMSTACK_SAME_FIELD_VALUE_DIFFERENT'
const GENERIC_ERROR = "You may not have entered the information that properly connects to your account with the online portal. Also, please check that all payment information is correct."
const uuid = crypto.randomUUID()
/** @type {HTMLButtonElement} */
let submitButton
/** @type {HTMLButtonElement} */
let cloneSubmitButton

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @param {string} queryString 
 * @returns {Record<string, string>}
 */
function queryStringToObject(queryString) {
  // Remove the leading '?' if it exists
  if (queryString.startsWith('?')) {
    queryString = queryString.substring(1);
  }

  // Split the query string into key-value pairs
  const pairs = queryString.split('&');

  // Create an object to hold the results
  const result = {};

  // Iterate over the pairs and add them to the result object
  for (const pair of pairs) {
    // Split each pair into a key and a value
    const [key, value] = pair.split('=');

    // Decode the value and add it to the result object
    if (key) {
      result[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }

  return result;
}

/**
   * @param {Element} element 
   */
function cloneAndReplace(element) {
  const clone = element.cloneNode(true)
  const parent = element.parentElement

  if (!parent) {
    console.warn({
      error: 'Parent is not found',
      element,
    })
    return null
  }

  element.remove()
  parent.appendChild(clone)
  return clone
}

function cleanupButton() {
  if (submitButton) {
    cloneSubmitButton.parentElement.appendChild(submitButton)
  }
  if (cloneSubmitButton) {
    cloneSubmitButton.remove()
  }
}

async function load() {
  console.log('GE EMBED LOADED', embedId)

  for (const field of document.querySelectorAll(`input[data-fs-field-name="creditcard"]`)) {
    if (field.disabled) field.disabled = false
  }

  const embedDiv = document.querySelector(`div[data-ge-embed="${embedId}"]`)
  const errorDiv = embedDiv.querySelector('#ge-formstack-embed-error')

  function handleError(
    /** @type {string | HTMLElement} */ message = null,
    /** @type {HTMLElement} */ submitter
  ) {
    if (!message && !errorDiv.classList.contains('ge-formstack-embed-error__hidden')) {
      errorDiv.classList.add('ge-formstack-embed-error__hidden')
      return
    } else if (!message) {
      return
    } else {
      errorDiv.classList.remove('ge-formstack-embed-error__hidden')
    }

    cleanupButton()

    const textDiv = errorDiv.querySelector('.ge-formstack-embed-error__text')

    if (textDiv) {
      textDiv.classList.remove('non-text')
      if (message.outerHTML) {
        textDiv.classList.add('non-text')
        for (const button of message.querySelectorAll('input[type="button"], button, br')) {
          button.remove()
        }
        textDiv.innerHTML = message.outerHTML
      } else {
        textDiv.innerHTML = message
      }
    }

    errorDiv?.scrollIntoView({
      behavior: 'smooth'
    });

    if (submitter && submitter.classList.contains('ge-submit-button-disable')) {
      submitter.classList.remove('ge-submit-button-disable')
    }
  }

  const EVENT_OPTIONS = {bubbles: true, cancelable: false, composed: true, simulated: true};
  const EVENTS = {
      BLUR: new Event("blur", EVENT_OPTIONS),
      CHANGE: new Event("change", EVENT_OPTIONS),
      INPUT: new Event("input", EVENT_OPTIONS),
  };

  /**
   * @param {Element} element 
   */
  async function setInputValue(element, value) {
    if (!element) {
      console.warn('Input not found', value)
      return
    }

    await wait(50)

    let lastValue = element.value;

    element.setAttribute('value', value)
    element.value = value
    const tracker = element._valueTracker;
    tracker && tracker.setValue(lastValue);
    element.dispatchEvent(EVENTS.INPUT);
    element.dispatchEvent(EVENTS.BLUR);
    element.dispatchEvent(EVENTS.CHANGE);
  }

  /**
   * @param {import("../../src/types/formstack").FormstackDataMappingField} field
   * @param {any} value
   * @returns 
   */
  function formatDataMap(field, value) {
    if (!value) return ''
    switch (field.formatter) {
      case 'familyName': {
        if (typeof value != 'string') return null
        return value.split(',')[0]
      }
      case 'toAge': {
        if (typeof value != 'string') return null
        const birthDate = new Date(value);

        if (isNaN(birthDate)) {
          console.warn(`Unable to turn date "${value}" to age.`)
          return null
        }

        const today = new Date();

        let age = today.getFullYear() - birthDate.getFullYear();

        const monthDifference = today.getMonth() - birthDate.getMonth();
        const dayDifference = today.getDate() - birthDate.getDate();

        if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
          age--;
        }

        return age;
      }
      default: {
        return value
      }
    }
  }

  const parent = embedDiv.closest('.fsRowBody') || embedDiv.closest('.fsCell') || embedDiv?.parentElement?.parentElement

  if (parent) {
    parent.classList.add("ge-embed-parent-container")
  }

  /** @type {Record<string, any>} */
  const fieldMapping = JSON.parse(decodeURIComponent(embedDiv.dataset.geEmbedFieldMapping))
  /** @type {Record<string, any>} */
  const mainMapping = JSON.parse(decodeURIComponent(embedDiv.dataset.geEmbedMainMapping))
  /** @type {import("../../src/types/formstack").FormstackDataMapping} */
  const dataMapping = embedDiv.dataset.geEmbedDataMapping ? (
    JSON.parse(decodeURIComponent(embedDiv.dataset.geEmbedDataMapping))
  ) : null
  /** @type {Record<string, any>} */
  const dataMap = embedDiv.dataset.geEmbedDataMapping ? (
    JSON.parse(decodeURIComponent(embedDiv.dataset.geEmbedDataMap))
  ) : {}
  /** @type {string} */
  const preApi = embedDiv.dataset.geEmbedPreApi
  const api = embedDiv.dataset.geEmbedApi
  const hostname = embedDiv.dataset.geHostname
  /** @type {import("axios").Method} */
  const method = embedDiv.dataset.geEmbedMethod
  /** @type {string} */
  const submissionIdField = embedDiv.dataset.geSubmissionIdField
  /** @type {string} */
  const submissionIdFieldId = embedDiv.dataset.geSubmissionIdFieldId
  /** @type {boolean} */
  const isFinancialApiEnabled = JSON.parse(embedDiv.dataset.geIsFinancialApiEnabled)

  const geApi = new URL(window.location.protocol + '//' + api)
  const geHostname = new URL(window.location.protocol + '//' + hostname)

  const submissionIdInput = cloneAndReplace(document.querySelector(`input[name="field${submissionIdFieldId}"]`))

  if (submissionIdInput) {
    await setInputValue(submissionIdInput, uuid)
  }

  const form = document.querySelector("form")

  let isReadyToSubmit = false;

  /**
   * @param {string} label 
   * @param {HTMLElement} parent 
   */
  const findInputByLabel = (label, inputSelector = 'input', parent) => {
    if (!parent) parent = document

    const trimmedLabel = label.trim().toLocaleLowerCase()

    const inputs = parent.querySelectorAll(inputSelector)

    for (const input of inputs) {
      if (input.getAttribute('label') && input.getAttribute('label').trim().toLocaleLowerCase() == trimmedLabel) {
        return input
      }
    }


    /** @type {HTMLElement} */
    let labelElement = null
    const spans = parent.querySelectorAll('span')

    for (const span of spans) {
      if (span.innerText.trim().toLocaleLowerCase() == trimmedLabel) {
        labelElement = span
        break
      }
    }

    if (!labelElement) {
      return null
    }

    return labelElement.closest(inputSelector)
  }

  /**
   * @param {object} obj 
   * @param {string | string[]} rootKey 
   * @returns {*} The value found at the path specified by rootKey, or undefined if not found.
   */
  function getValueFromRootKey(obj, rootKey) {
    // If rootKey is a string, split it into an array of keys
    const keys = Array.isArray(rootKey) ? rootKey : rootKey.split('.');

    // Return undefined if the path is empty or the input object is not an object
    if (!keys.length || typeof obj !== 'object' || obj === null) return undefined;

    // Traverse the object using the keys
    let result = obj;
    for (const key of keys) {
      // Convert key to number if it's a valid array index
      const numericKey = Number(key);
      if (!isNaN(numericKey) && Array.isArray(result)) {
        // Handle array index
        result = result[numericKey];
      } else if (result && typeof result === 'object') {
        // Handle object key
        result = result[key];
      } else {
        // If result is not an object or array, return undefined
        return undefined;
      }

      // Return undefined if the key does not exist
      if (result === undefined) {
        return undefined;
      }
    }

    return result;
  }

  const handleDataMap = async () => {
    if (!dataMapping) return

    const qsObject = location.search ? queryStringToObject(location.search) : {}

    try {
      /** @type {import("axios").AxiosResponse} */
      const response = await axios.request({
        url: geApi.origin + dataMapping.api,
        method: dataMapping.method,
        params: {
          token: qsObject.token,
        }
      })

      for (const [key, field] of Object.entries(dataMapping.fields)) {
        switch (field.type) {
          case 'customPath': {
            if (!field.path.startsWith('$rootKey.')) {
              if (!dataMap[key]) {
                break
              }
              const input = findInputByLabel(dataMap[key], 'input')
              if (!input) {
                break
              }
              const value = getValueFromRootKey(response.data, field.path)
              input.setAttribute('readonly', '')
              await setInputValue(input, formatDataMap(field, value))
            }
            break
          }
        }
      }

      /** @type {object[]} */
      let root = response.data

      if (dataMapping.rootKey) {
        root = getValueFromRootKey(root, dataMapping.rootKey)

        if (!(Symbol.iterator in Object(root))) {
          console.warn({
            message: 'Root is not iterable'
          })
          root = []
        }
      }

      for (const [index, entry] of root.entries()) {
        const foundCheckbox = document.querySelector('input[value="Check here to add another student"]:not([data-chxbox-selected="true"])')
        if (foundCheckbox && index <= root.length-1) {
          await wait(50)
          foundCheckbox.setAttribute('data-chxbox-selected', 'true')
          foundCheckbox.click()
          foundCheckbox.checked = true
        }

        for (const [name, value] of Object.entries(dataMap)) {
          /** @type {HTMLElement} */
          let input

          const field = dataMapping.fields[name]
          switch (field.type) {
            case 'bundled': {
              input = findInputByLabel(value, 'input:not([data-bundled-selected="true"])')
              if (!input) break

              input.setAttribute('data-bundled-selected', 'true')
              input.setAttribute('readonly', '')
              await setInputValue(input, formatDataMap(field, entry[name]))
              break
            }
            case 'same': {
              const value = entry[name] && formatDataMap(field, entry[name])
              if (!field.__sameVal && value) {
                field.__sameVal = value
              } else if (field.__sameVal != VALUE_DIFFERENT && value && field.__sameVal != value) {
                field.__sameVal = VALUE_DIFFERENT
              }
              break
            }
            case 'customPath': {
              if (field.path.startsWith('$rootKey.')) {
                input = findInputByLabel(value, 'input')
                if (!input) break

                const value = getValueFromRootKey(entry, field.path.substring(8))
                input.setAttribute('readonly', '')
                await setInputValue(input, formatDataMap(field, value))
              }
              break
            }
            default: {
              console.error({
                message: 'Illegal type for data map field!',
                field,
                value,
              })
            }
          }
        }
      }

      // Post loop
      for (const [name, value] of Object.entries(dataMap)) {
        const field = dataMapping.fields[name]

        switch (field.type) {
          case 'same': {
            if (!field.__sameVal || field.__sameVal == VALUE_DIFFERENT) continue

            const input = findInputByLabel(value, 'input')
            if (!input) continue

            await setInputValue(input, formatDataMap(field, field.__sameVal))
            input.setAttribute('readonly', '')
          }
        }
      }

      for (const checkbox of document.querySelectorAll('input[value="Check here to add another student"]')) {
        const label = checkbox.closest('label')

        if (label) {
          label.style.display = 'none'
        }
      }
    } catch (error) {
      console.warn({
        message: 'An error has occured while data mapping.',
        error,
        dataMapping,
        dataMap
      })
      console.trace(error)
      console.error(error)
    }
  }

  if (!form) {
    console.warn({message: 'Form not found!'})
    return
  }

  submitButton = form.querySelector('button[type="submit"]')

  handleDataMap()

  const qsObject = location.search ? queryStringToObject(location.search) : {}

  /** @type {import("axios").AxiosResponse} */
  const { data: ffsid } = await axios.request({
    url: geApi.origin + '/sysapi/api/Formstack/LogFormstackSubmission',
    method: 'POST',
    data: {
      formstackMailToken: qsObject.token,
      formstackSubmissionId: uuid,
      formStackFormId: embedDiv.dataset.geFormId,
      formStackFormFolderId: embedDiv.dataset.geFormFolderId,
    }
  })

  const handleSubmit = async (event) => {
    if (isReadyToSubmit) {
      if (submissionIdInput) {
        setInputValue(submissionIdInput, uuid)
      }

      return;
    }
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();

    if (event.submitter && !event.submitter.classList.contains('ge-submit-button-disable')) {
      event.submitter.classList.add('ge-submit-button-disable')
    }
    
    const formData = new FormData(form)

    var formEntries = {};
    formData.forEach((value, key) => formEntries[key] = value);

    let data = {}

    for (const [field, id] of Object.entries(fieldMapping)) {
      data[field] = formEntries[`field${id}`]
    }

    data[submissionIdField] = uuid

    if (middleware) {
      try {
        data = await middleware({ data, mainMapping, fieldMapping, formEntries, geHostname, ffsid })
      } catch (error) {
        console.error(error)
        handleError(
          error?.message ? error.message : GENERIC_ERROR,
          event.submitter
        )
        return
      }
    }

    data.willStage = true

    const qsObject = location.search ? queryStringToObject(location.search) : {}


    if (qsObject.token) {
      data.formstackMailToken = qsObject.token
    }

    data.formStackFormId = embedDiv.dataset.geFormId
    data.formStackFormFolderId = embedDiv.dataset.geFormFolderId
    data.formstackFinancialDisabled = !isFinancialApiEnabled

    if (preApi) {
      try {
        const gePreApi = new URL(window.location.protocol + '//' + preApi)

        /** @type {import("axios").AxiosResponse} */
        const res = await axios.request({
          url: gePreApi,
          method,
          data,
        })

        if (!(res.status >= 200 && res.status < 300)) {
          throw { message: 'An error has occured', data: res.data }
        }
        
      } catch (error) {
        console.error(error)
        handleError(GENERIC_ERROR)
        return
      }
    }

    let baseApi = geApi

    if (baseApiInterceptor) {
      baseApi = baseApiInterceptor(geApi, data)
    }

    try {
      /** @type {import("axios").AxiosResponse} */
      const res = await axios.request({
        url: baseApi,
        method,
        data,
      })

      if (!(res.status >= 200 && res.status < 300)) {
        throw { message: 'An error has occured', data: res.data }
      }

      handleError(null, event.submitter);

      if (submissionIdInput) {
        await setInputValue(submissionIdInput, uuid)
      }

      isReadyToSubmit = true

      form.submit()
    } catch (error) {
      console.error(error)
      handleError(GENERIC_ERROR, event.submitter)
    }
  }

  form.addEventListener("submit", (event) => {
    cloneSubmitButton = submitButton.cloneNode(true)
    submitButton.parentElement.appendChild(cloneSubmitButton)
    submitButton.parentElement.removeChild(submitButton)
    cloneSubmitButton.disabled = true
    cloneSubmitButton.innerHTML = 'Submitting...'
    
    return handleSubmit(event)
  })
}

window.addEventListener('load', load)