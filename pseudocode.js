function approve() {
  // === "borrowerCanBorrow" ===
  // returns: a true or false
  const reservation = await Reservation.findOne() // the reservation
  const vehicle = await Vehicle.findOne() // vehicle for this reservaton
  const borrowerCompany = await Company.findOne() // borrower company, of course

  const success = borrowerCanBorrow({
    reservation,
    vehicle,
    borrowerCompany
  })

  if (!success) {
    return {
      success: false
    }
  }

  // === "chargeBorrowerInitial" ===
  // side effects:
  //   sends transaction to strip
  //   saves a PDF
  //   saves the statement

  const latestStatement = await Statement.findOne()
  const lenderCompany = await Company.findOne()

  // = Do actual charging =
  // Should this be two steps or one?
  // TODO error handling? what if it fails
  const charge = computeStripeCharge(latestStatement)
  try {
    await performCharge(charge) // send to stripe and 
  } catch {
    saveEvents('charge-failed')

    return new Error()
  }

  const stripeTransaction = await fetchLatestStripeTransaction()

  // = Create and save line item PDFs =
  const borrowerLineItemInvoicePDF = generateLineItemInvoice(latestReservation, borrowerCompany, 'borrower')
  const lenderLineItemInvoicePDF = generateLineItemInvoice(latestReservation, lenderCompany, 'lender')
  try {
    await saveLineItemsToS3(borrowerLineItemInvoicePDF)
    await saveLineItemsToS3(lenderLineItemInvoicePDF)
  } catch {
    // and do what if we fail? Undo stripe charge?
    return new Error()
  }

  // = Create new statement =
  const newStatement = generateNewStatement(latestStatement, stripeTransactions)
  try {
    await newStatement.save()
  } catch {
    // and do what if we fail?
    return new Error()
  }

  // Four types of functions:
  // - _fetch_ data from DB or API. Should be as small as possible
  // - _compute_ some values or intermediate objects. Must be a syncronous function
  // - _commit_ precomputed data to DB or email or S3.
  // - _revert_ commit function? In case complex logic fails. Much of the time this is impossible.
}