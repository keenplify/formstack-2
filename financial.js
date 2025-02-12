/* global axios */

// eslint-disable-next-line no-unused-vars
async function middleware({ data, mainMapping, fieldMapping, formEntries, geHostname, ffsid }) {
  const {exp, cvv, ccnum, amount, achAccountnum, achRouting, ...newData} = data

  if (mainMapping.chfid && !newData.chfid) {
    newData.chfid = mainMapping.chfid
  }

  if (typeof mainMapping.addChargeFee == 'boolean') {
    newData.chargeFee = mainMapping.addChargeFee ?? false
  } else if (mainMapping.addChargeFee == 'Ask' && mainMapping.askChargeFeeCheckbox) {
    const [checkboxId, optionValue] = mainMapping.askChargeFeeCheckbox.split('_$_')
    const entry = formEntries[`field${checkboxId}`] || formEntries[`field${checkboxId}[]`]

    newData.chargeFee = (entry == optionValue)
  } else {
    newData.chargeFee = false
  }

  let isAch = false
  let isAddPledge = false

  if (mainMapping.paymentMethod == 'ach') {
    isAch = true
  } else if (
    mainMapping.paymentMethod == 'userDefined'
  ) {
    const entry = formEntries[`field${mainMapping.paymentMethodField}`]
    if (mainMapping.achValue && entry && entry == mainMapping.achValue) {
      isAch = true
    }

    if (mainMapping.invoiceValue && entry && entry == mainMapping.invoiceValue) {
      isAddPledge = true
    }
  } else if (mainMapping.paymentMethod == 'billMe') {
    isAddPledge = true
  }

  newData.isAch = isAch
  newData.isAddPledge = isAddPledge

  if (amount) {
    newData.amount = Number(amount)
  }

  /**
   * formats date to 'YYYY-MM-DD' format
   * @param {Date} date 
   */
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const name = []
  
  if (newData.firstName) name.push(newData.firstName)
  if (newData.lastName) name.push(newData.lastName)

  if (!newData.paymentDate) {
    newData.paymentDate = formatDate(new Date)
  }

  /** @param {string} phoneNumber */
  function formatPhoneNumber(phoneNumber) {
    // Remove all non-numeric characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Ensure the phone number is in the correct format
    let match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);

    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    // Return the original input if it doesn't match the expected format
    return phoneNumber;
  }

  if (newData.phone) {
    newData.phone = formatPhoneNumber(newData.phone)
  }
  
  newData.paymentsource = 'formstack'
  newData.ffsid = ffsid
  
  if (!isAch && !isAddPledge) {
    if (exp) {
      const [month, year] = exp.split(' / ')
  
      newData.expmonth = month.trim()
      newData.expyr = `${`${new Date().getFullYear()}`.substring(0, 2)}${year}`.trim()
    }

    if (ccnum) {
      newData.ccnum = ccnum.replace(/\s/g, "").trim()
    } 

    newData.ccname = name.join(' ').trim()
    newData.cvv = cvv.trim()

    try {
      /** @type {import("axios").AxiosResponse} */
      const res = await axios.request({
        url: `${geHostname.href}sysapi/api/PayForm/ValidateCreditCard`,
        method: 'POST',
        data: newData,
      })

      if (!(res.status >= 200 && res.status < 300)) {
        throw { message: 'An error has occured', data: res.data }
      }
    } catch (error) {
      console.error(error)
      throw {
        message: 'Your credit card has been declined.'
      }
    }
  } else if (isAch) {
    newData.achPaymentInfo = {
      ...newData,
      accountname: name.join(' '),
      accountnum: achAccountnum.trim(),
      routing: achRouting.trim(),
      amount: `${amount}`,
    }

    try {
      /** @type {import("axios").AxiosResponse} */
      const res = await axios.request({
        url: `${geHostname.href}sysapi/api/PayForm/ValidateACH`,
        method: 'POST',
        data: newData.achPaymentInfo,
      })

      if (!(res.status >= 200 && res.status < 300)) {
        throw { message: 'An error has occured', data: res.data }
      }
    } catch (error) {
      console.error(error)
      throw {
        message: 'Your ACH has been declined.'
      }
    }
  } else if (isAddPledge) {
    newData.pledgeInfo = {
      ...newData,
      pledgeDate: newData.paymentDate,
      source: "formstack"
    }
  }

  return newData
}

/**
 * @param {URL} geApi
 * @param {object} data
*/
// eslint-disable-next-line no-unused-vars
function baseApiInterceptor(geApi, data) {
  if (data.isAddPledge) {
    return new URL(geApi.origin + '/sysapi/api/PayForm/FormStackAddPledgeStaging')
  } else {
    return geApi
  }
}