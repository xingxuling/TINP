import {EvidenceLedger,verifyLedger} from './evidence.mjs';

function compactReceipt(receipt){
  return {
    format:'twni.guarded-mcp-audit-record.v1',
    receiptRoot:receipt.receiptRoot,
    status:receipt.status,
    toolName:receipt.toolName,
    inputRoot:receipt.inputRoot,
    bindingRoot:receipt.bindingRoot,
    contractRoot:receipt.contractRoot,
    admissionRoot:receipt.admissionRoot??null,
    providerCalls:receipt.providerCalls,
    implicitRetries:receipt.implicitRetries,
    executionMayHaveOccurred:receipt.executionMayHaveOccurred,
    providerResultRoot:receipt.providerResultRoot??null,
    inputResourceVerificationRoot:receipt.inputResourceVerification?.verificationRoot??null,
    observationVerificationRoot:receipt.observationVerification?.verificationRoot??null,
    observationStatus:receipt.observationVerification?.status??null,
    violations:structuredClone(receipt.observationVerification?.violations??[]),
    exactApprovalRequired:receipt.exactApproval?.required??false,
    exactApprovalStatus:receipt.exactApproval?.status??'NOT_REQUIRED',
    exactApprovalPolicyRoot:receipt.exactApproval?.approvalPolicyRoot??null,
    exactChallengeRoot:receipt.exactApproval?.challengeRoot??null,
    exactApprovalRoot:receipt.exactApproval?.approvalRoot??null,
    exactApprovalVerificationRoot:receipt.exactApproval?.verificationRoot??null,
    exactApprovalConsumptionRoot:receipt.exactApproval?.consumptionRoot??null,
    boundary:'Redacted audit record: no raw input, provider result content, credentials, signatures, or full observation payload is persisted.',
  };
}

export class GuardedMcpAuditLedger{
  constructor(file){
    this.ledger=new EvidenceLedger(file);
  }
  get root(){return this.ledger.root;}
  get length(){return this.ledger.events.length;}
  async record(receipt){
    const record=compactReceipt(receipt);
    const event=this.ledger.append('guarded-mcp.receipt',record);
    return {eventRoot:event.eventRoot,ledgerRoot:this.root,sequence:event.sequence};
  }
  verify(){
    return verifyLedger(this.ledger.events);
  }
  summaries(){
    return this.ledger.events.map(event=>structuredClone(event.detail));
  }
  sink(){
    return receipt=>this.record(receipt);
  }
}

export {compactReceipt};
