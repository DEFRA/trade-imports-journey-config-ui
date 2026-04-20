/**
 * Field-to-path mapping: fieldName → notification schema path.
 *
 * This is CHED-A/IMP-specific. It encodes knowledge about the notification
 * schema structure. A different certificate type would need its own mapping.
 *
 * For address_group fields, subFields use the "parent__child" naming convention
 * and map to nested notification paths.
 *
 * Fields with {index} placeholders (repeating fields) are not mapped here —
 * they require per-item handling which is out of scope for the prototype.
 *
 * @type {Object<string, string>}
 */
export const fieldPathMapping = {
  // Section 1: About
  'cert-type': 'type',
  'origin-country': 'partOne.commodities.countryOfOrigin',
  'region-code': 'partOne.commodities.regionOfOrigin',
  purpose: 'partOne.purpose.purposeGroup',
  'sub-purpose': 'partOne.purpose.internalMarketPurpose',
  'exit-bcp': 'partOne.purpose.exitBIP',
  'port-of-exit': 'partOne.portOfExit',

  // Section 2: Description of the goods
  'selected-commodity':
    'partOne.commodities.commodityComplement[0].commodityID',
  'commodity-taxonomy':
    'partOne.commodities.commodityComplement[0].speciesTypeName',
  'species-type': 'partOne.commodities.commodityComplement[0].speciesType',
  'species-class': 'partOne.commodities.commodityComplement[0].speciesClass',
  'species-family':
    'partOne.commodities.commodityComplement[0].speciesFamilyName',
  'species-nomination':
    'partOne.commodities.commodityComplement[0].speciesNomination',
  species: 'partOne.commodities.commodityComplement[0].speciesName',
  'animals-certified-as': 'partOne.commodities.animalsCertifiedAs',
  'unweaned-animal': 'partOne.commodities.includeNonAblactedAnimals',

  // Section 3: Documents
  'certificate-reference': 'partOne.veterinaryInformation.veterinaryDocument',
  'certificate-date':
    'partOne.veterinaryInformation.veterinaryDocumentIssueDate',

  // Section 4: Addresses — consignor
  'consignor__trader-name': 'partOne.consignor.traderName',
  'consignor__trader-company-name': 'partOne.consignor.companyName',
  'consignor__address-line-1': 'partOne.consignor.addressLine1',
  'consignor__address-line-2': 'partOne.consignor.addressLine2',
  'consignor__address-line-3': 'partOne.consignor.addressLine3',
  consignor__city: 'partOne.consignor.city',
  'consignor__postal-code': 'partOne.consignor.postalCode',
  consignor__country: 'partOne.consignor.country',
  consignor__email: 'partOne.consignor.email',
  consignor__phone: 'partOne.consignor.telephone',

  // Section 4: Addresses — consignee
  'consignee__trader-name': 'partOne.consignee.traderName',
  'consignee__trader-company-name': 'partOne.consignee.companyName',
  'consignee__address-line-1': 'partOne.consignee.addressLine1',
  'consignee__address-line-2': 'partOne.consignee.addressLine2',
  'consignee__address-line-3': 'partOne.consignee.addressLine3',
  consignee__city: 'partOne.consignee.city',
  'consignee__postal-code': 'partOne.consignee.postalCode',
  consignee__country: 'partOne.consignee.country',
  consignee__email: 'partOne.consignee.email',
  consignee__phone: 'partOne.consignee.telephone',

  // Section 4: Addresses — importer
  'importer__trader-name': 'partOne.importer.traderName',
  'importer__trader-company-name': 'partOne.importer.companyName',
  'importer__address-line-1': 'partOne.importer.addressLine1',
  'importer__address-line-2': 'partOne.importer.addressLine2',
  'importer__address-line-3': 'partOne.importer.addressLine3',
  importer__city: 'partOne.importer.city',
  'importer__postal-code': 'partOne.importer.postalCode',
  importer__country: 'partOne.importer.country',
  importer__email: 'partOne.importer.email',
  importer__phone: 'partOne.importer.telephone',

  // Section 4: Addresses — place of destination
  'place-of-destination__trader-name': 'partOne.placeOfDestination.traderName',
  'place-of-destination__trader-company-name':
    'partOne.placeOfDestination.companyName',
  'place-of-destination__address-line-1':
    'partOne.placeOfDestination.addressLine1',
  'place-of-destination__address-line-2':
    'partOne.placeOfDestination.addressLine2',
  'place-of-destination__address-line-3':
    'partOne.placeOfDestination.addressLine3',
  'place-of-destination__city': 'partOne.placeOfDestination.city',
  'place-of-destination__postal-code': 'partOne.placeOfDestination.postalCode',
  'place-of-destination__country': 'partOne.placeOfDestination.country',
  'place-of-destination__email': 'partOne.placeOfDestination.email',
  'place-of-destination__phone': 'partOne.placeOfDestination.telephone',

  // Section 4: Addresses — permanent address (conditional)
  'permanent-address__address-line-1':
    'partOne.commodities.complementParameterSet[0].identifiers[0].permanentAddress.addressLine1',
  'permanent-address__address-line-2':
    'partOne.commodities.complementParameterSet[0].identifiers[0].permanentAddress.addressLine2',
  'permanent-address__address-line-3':
    'partOne.commodities.complementParameterSet[0].identifiers[0].permanentAddress.addressLine3',
  'permanent-address__city':
    'partOne.commodities.complementParameterSet[0].identifiers[0].permanentAddress.city',
  'permanent-address__postcode':
    'partOne.commodities.complementParameterSet[0].identifiers[0].permanentAddress.postalCode',
  'permanent-address__telephone':
    'partOne.commodities.complementParameterSet[0].identifiers[0].permanentAddress.telephone',

  // Section 5: Transport
  'cph-number': 'partOne.cphNumber',
  bcp: 'partOne.pointOfEntry',
  'estimated-arrival-date': 'partOne.arrivalDate',

  // Section 5: Transport — transporter address
  transporter__name: 'partOne.transporter.traderName',
  'transporter__company-name': 'partOne.transporter.companyName',
  'transporter__address-line-1': 'partOne.transporter.addressLine1',
  'transporter__address-line-2': 'partOne.transporter.addressLine2',
  'transporter__address-line-3': 'partOne.transporter.addressLine3',
  transporter__city: 'partOne.transporter.city',
  'transporter__postal-code': 'partOne.transporter.postalCode',
  transporter__country: 'partOne.transporter.country',
  'transporter__approval-number': 'partOne.transporter.approvalNumber',
  transporter__email: 'partOne.transporter.email',
  transporter__phone: 'partOne.transporter.telephone',

  // Section 6: Complete notification
  'selected-contact-address': 'partOne.nominatedContacts[0]',
  'declaration-confirmed': 'partOne.submissionDate',

  // Commodity complement detail (array-nested)
  'complement-key-data':
    'partOne.commodities.complementParameterSet[0].keyDataPair[0]',

  // Animal identification (array-nested)
  'animal-identifier-data':
    'partOne.commodities.complementParameterSet[0].identifiers[0].data',

  // Establishments of origin (array-nested)
  'establishment-approval':
    'partOne.veterinaryInformation.establishmentsOfOrigin[0].approvalNumber',

  // Accompanying documents (array-nested)
  'doc-type':
    'partOne.veterinaryInformation.accompanyingDocuments[0].documentType',
  'doc-reference':
    'partOne.veterinaryInformation.accompanyingDocuments[0].documentReference',
  'doc-date':
    'partOne.veterinaryInformation.accompanyingDocuments[0].documentIssueDate',
  'doc-attachment':
    'partOne.veterinaryInformation.accompanyingDocuments[0].attachmentId'
}
