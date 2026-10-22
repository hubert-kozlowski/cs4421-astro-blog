import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

/**
 * Kept separate from the service stack because Name.com DNS validation is a
 * deliberate, one-time manual step. Deploy this stack first and add the ACM
 * CNAME records before deploying the service stack.
 */
export class DomainCertificateStack extends cdk.Stack {
	public readonly certificate: acm.ICertificate;

	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		this.certificate = new acm.Certificate(this, 'GridironAtlasCertificate', {
			domainName: 'gridironatlas.app',
			subjectAlternativeNames: ['www.gridironatlas.app'],
			validation: acm.CertificateValidation.fromDns(),
		});

		new cdk.CfnOutput(this, 'CertificateArn', {
			value: this.certificate.certificateArn,
		});
	}
}
