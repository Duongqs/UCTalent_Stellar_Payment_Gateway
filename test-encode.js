const params = {
  account_name: 'NGUYEN VAN A',
  description: 'UCTalent Freelance Disbursement'
};
const sortedParams = {};
Object.keys(params).sort().forEach(key => { sortedParams[key] = params[key]; });
const str1 = new URLSearchParams(sortedParams).toString();
const str2 = str1.replace(/\+/g, '%20');
console.log('Original:', str1);
console.log('Replaced:', str2);
