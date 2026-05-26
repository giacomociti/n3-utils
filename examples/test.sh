 npx eyeling ../rules.n3 localName.n3 > localName_out.ttl
 npx eyeling ../rules.n3 sortByProperty.n3 > sortByProperty_out.ttl
 npx eyeling --builtin ../builtins/sparql.js sparql/test-builtins.n3 > sparql/test-builtins-out.ttl