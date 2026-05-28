const SPARQL_NS = 'https://raw.githubusercontent.com/giacomociti/n3-utils/refs/heads/main/builtins/sparql.js#';


// execution of a SPARQL query (synchronously, no async allowed, see also eyeling `deref`)

const isNode = () => typeof process !== 'undefined' && !!(process.versions && process.versions.node);
const hasXmlHttpRequest = () => typeof XMLHttpRequest !== 'undefined';

// should work in the browser if CORS allows it
const runQueryBrowser = (endpoint, query) => {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, false); // synchronous
    try {
      xhr.setRequestHeader('Content-Type', 'application/sparql-query; charset=UTF-8');
      xhr.setRequestHeader('Accept', 'application/sparql-results+json');
    } catch {
      // Some environments restrict setting headers (ignore).
    }
    xhr.send(query);
    const sc = xhr.status || 0;
    if (sc < 200 || sc >= 300) return null;
    return xhr.responseText;
  } catch {
    return null;
  }
}

const runQueryNode = (endpoint, query) => {
  const cp = require('child_process');
  const r = cp.spawnSync("curl", ['-X', 'POST', '--data', `query=${encodeURIComponent(query)}`, '-H', 'Accept: application/sparql-results+json', endpoint], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout;
}

const runQuery = 
  isNode() ? runQueryNode : 
  hasXmlHttpRequest() ? runQueryBrowser : 
  () => { throw new Error("No way to run queries"); };

// eyeling builtin for running SPARQL queries against an endpoint
const sparqlBuiltin = (obj) => {
  const { registerBuiltin, internLiteral, terms, ns } = obj;
  const { Var, Iri, Blank, ListTerm, Literal, GraphTerm } = terms;

  // format eyeling terms as SPARQL query terms
  const formatVar = (term) => `?${term.name}`;
  const formatLiteral = (term) => term.value ;
  const formatIri = (term) => `<${term.value}>`;
  const formatListTerm = (term) => '(' + term.elems.map(formatTerm).join(' ') + ')';

  function formatTerm (term) {
    if (term instanceof Var) return formatVar(term); // blanks are also passed as variables
    if (term instanceof Iri) return formatIri(term);
    if (term instanceof Literal) return formatLiteral(term);
    if (term instanceof ListTerm) return formatListTerm(term);
  }

  // convert SPARQL query results to eyeling terms
  const getTerm = (binding) => {
    if (binding.type === 'uri') 
      return new Iri(binding.value);
    if (binding.type === 'literal') {
      if (binding.datatype) {
        return internLiteral(JSON.stringify(binding.value) + '^^<' + binding.datatype + '>');
      }
      if (binding['xml:lang']) {
        return internLiteral(JSON.stringify(binding.value) + '@' + binding['xml:lang']);
      }
      return internLiteral(JSON.stringify(binding.value));
    }
    if (binding.type === 'bnode') 
      return new Blank('_:' + binding.value);
  }

  const getSubstitutions = (solution) => {
    const subst = {};
    for (const [varName, term] of Object.entries(solution)) {
      subst[varName] = getTerm(term);
    }
    return subst;
  }

  // many built-ins can be implemented as SPARQL 

  const cryptoSha = (s, o, vars) => {
    if (o instanceof Var && !vars.has(o.name)) {
      return `BIND(SHA1(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(SHA1(${formatTerm(s)}) = ${formatTerm(o)})`;
  }

  const mathGreaterThan = (s, o) => `FILTER (${formatTerm(s)} > ${formatTerm(o)})`;
  const mathLessThan = (s, o) => `FILTER (${formatTerm(s)} < ${formatTerm(o)})`;
  const mathNotGreaterThan = (s, o) => `FILTER (${formatTerm(s)} <= ${formatTerm(o)})`;
  const mathNotLessThan = (s, o) => `FILTER (${formatTerm(s)} >= ${formatTerm(o)})`;
  const mathEqualTo = (s, o) => `FILTER (${formatTerm(s)} = ${formatTerm(o)})`;
  const mathNotEqualTo = (s, o) => `FILTER (${formatTerm(s)} != ${formatTerm(o)})`;
  const mathSum = (s, o, vars) => {
    if (!s instanceof ListTerm) return;
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(${s.elems.map(formatTerm).join(' + ')} AS ${formatTerm(o)})`;
    }
    return `FILTER(${s.elems.map(formatTerm).join(' + ')} = ${formatTerm(o)})`;
  }
  const mathProduct = (s, o, vars) => {
    if(!(s instanceof ListTerm)) return;
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(${s.elems.map(formatTerm).join(' * ')} AS ${formatTerm(o)})`;
    }
    return `FILTER(${s.elems.map(formatTerm).join(' * ')} = ${formatTerm(o)})`;
  }

  const mathDifference = (s, o, vars) => {
    if (!(s instanceof ListTerm) || s.elems.length !== 2) return;
    
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(${formatTerm(s.elems[0])} - ${formatTerm(s.elems[1])} AS ${formatTerm(o)})`;
    }
    return `FILTER(${formatTerm(s.elems[0])} - ${formatTerm(s.elems[1])} = ${formatTerm(o)})`;
  }

  const mathAbsoluteValue = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(ABS(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(ABS(${formatTerm(s)}) = ${formatTerm(o)})`;
  }

  const mathRounded = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(ROUND(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(ROUND(${formatTerm(s)}) = ${formatTerm(o)})`;
  }

  const timeDay = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(DAY(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(DAY(${formatTerm(s)}) = ${formatTerm(o)})`;
  }
  const timeMonth = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(MONTH(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(MONTH(${formatTerm(s)}) = ${formatTerm(o)})`;
  }
  const timeYear = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(YEAR(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(YEAR(${formatTerm(s)}) = ${formatTerm(o)})`;
  }
  const timeMinute = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(MINUTES(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(MINUTES(${formatTerm(s)}) = ${formatTerm(o)})`;
  }
  const timeSecond = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(SECONDS(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(SECONDS(${formatTerm(s)}) = ${formatTerm(o)})`;
  }
  const timeTimezone = (s, o, vars) => {
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(TZ(${formatTerm(s)}) AS ${formatTerm(o)})`;
    }
    return `FILTER(TZ(${formatTerm(s)}) = ${formatTerm(o)})`;
  }

  const listMember = (s, o, vars) => {
    if (!(s instanceof ListTerm)) return;
    if (o instanceof Var && !vars.has(o.name)) {
      return `VALUES ${formatTerm(o)} { ${s.elems.map(formatTerm).join(' ')} }`;
    }
    return `FILTER(${formatTerm(o)} IN (${s.elems.map(formatTerm).join(', ')}))`;
  };

  const listIn = (s, o, vars) => {
    if (!(o instanceof ListTerm)) return;
    if (s instanceof Var && !vars.has(s.name)) {
      return `VALUES ${formatTerm(s)} { ${o.elems.map(formatTerm).join(' ')} }`;
    }
    return `FILTER(${formatTerm(s)} IN (${o.elems.map(formatTerm).join(', ')}))`;
  };

  const logDtlit = (s, o, vars) => {
    if(!(s instanceof ListTerm) || s.elems.length !== 2) return;
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(STRDT(STR(${formatTerm(s.elems[0])}), ${formatTerm(s.elems[1])}) AS ${formatTerm(o)})`;
    }
    let lex, dt ;
    if (s.elems[0] instanceof Var && !vars.has(s.elems[0].name)) {
      lex = `BIND(STR(${formatTerm(o)}) AS ${formatTerm(s.elems[0])})`;
    } else {
      lex = `FILTER(STR(${formatTerm(o)}) = ${formatTerm(s.elems[0])})`;
    }
    if (s.elems[1] instanceof Var && !vars.has(s.elems[1].name)) {
      dt = `BIND(DATATYPE(${formatTerm(o)}) AS ${formatTerm(s.elems[1])})`;
    } else {
      dt = `FILTER(DATATYPE(${formatTerm(o)}) = ${formatTerm(s.elems[1])})`;
    }
    return `${lex}\n  ${dt}`;
  }

  const logLanglit = (s, o, vars) => {
    if(!(s instanceof ListTerm) || s.elems.length !== 2) return;
    if ((o instanceof Var) && !vars.has(o.name)) {
      return `BIND(STRLANG(STR(${formatTerm(s.elems[0])}), ${formatTerm(s.elems[1])}) AS ${formatTerm(o)})`;
    }
    let lex, lang ;
    if (s.elems[0] instanceof Var && !vars.has(s.elems[0].name)) {
      lex = `BIND(STR(${formatTerm(o)}) AS ${formatTerm(s.elems[0])})`;
    } else {
      lex = `FILTER(STR(${formatTerm(o)}) = ${formatTerm(s.elems[0])})`;
    }
    if (s.elems[1] instanceof Var && !vars.has(s.elems[1].name)) {
      lang = `BIND(LANG(${formatTerm(o)}) AS ${formatTerm(s.elems[1])})`;
    } else {
      lang = `FILTER(LANG(${formatTerm(o)}) = ${formatTerm(s.elems[1])})`;
    }
    return `${lex}\n  ${lang}`;
  }

  const logIncludes = (s, o, vars) => {
    // if (!(s instanceof Var)) return;
    if (!(o instanceof GraphTerm)) return;
    return `FILTER EXISTS { 
      ${toSparql(o.triples, new Set(vars))}
    }`;
  }

  const logNotIncludes = (s, o, vars) => {
    // if (!(s instanceof Var)) return;
    if (!(o instanceof GraphTerm)) return;
    return `FILTER NOT EXISTS { 
      ${toSparql(o.triples, new Set(vars))}
    }`;
  }

  const logEqualTo = (s, o) => `FILTER(${formatTerm(s)} = ${formatTerm(o)})`;
  const logNotEqualTo = (s, o) => `FILTER(${formatTerm(s)} != ${formatTerm(o)})`;

  const stringConcatenation = (s, o, vars) => {
    if (!(s instanceof ListTerm)) return;
    if (o instanceof Var && !vars.has(o.name)) {
      return `BIND(CONCAT(${s.elems.map(formatTerm).join(', ')}) AS ${formatTerm(o)})`;
    }
    return `FILTER(CONCAT(${s.elems.map(formatTerm).join(', ')}) = ${formatTerm(o)})`;
  }

  const stringContains = (s, o) => `FILTER(CONTAINS(${formatTerm(s)}, ${formatTerm(o)}))`;
  const stringContainsIgnoringCase = (s, o) => `FILTER(CONTAINS(LCASE(${formatTerm(s)}), LCASE(${formatTerm(o)})))`;
  const stringEndsWith = (s, o) => `FILTER(STRENDS(${formatTerm(s)}, ${formatTerm(o)}))`;
  const stringEqualIgnoringCase = (s, o) => `FILTER(LCASE(${formatTerm(s)}) = LCASE(${formatTerm(o)}))`;
  const stringGreaterThan = (s, o) => `FILTER(STR(${formatTerm(s)}) > STR(${formatTerm(o)}))`;
  const stringLessThan = (s, o) => `FILTER(STR(${formatTerm(s)}) < STR(${formatTerm(o)}))`;
  const stringMatches = (s, o) => `FILTER(REGEX(STR(${formatTerm(s)}), ${formatTerm(o)}))`;
  const stringNotEqualIgnoringCase = (s, o) => `FILTER(LCASE(${formatTerm(s)}) != LCASE(${formatTerm(o)}))`;
  const stringNotGreaterThan = (s, o) => `FILTER(STR(${formatTerm(s)}) <= STR(${formatTerm(o)}))`;
  const stringNotLessThan = (s, o) => `FILTER(STR(${formatTerm(s)}) >= STR(${formatTerm(o)}))`;
  const stringNotMatches = (s, o) => `FILTER(!REGEX(STR(${formatTerm(s)}), ${formatTerm(o)}))`;
  const stringReplace = (s, o) => {
    if ((s instanceof ListTerm) && s.elems.length === 3) {
      return `BIND(REPLACE(STR(${formatTerm(s.elems[0])}), STR(${formatTerm(s.elems[1])}), ${formatTerm(s.elems[2])}) AS ${formatTerm(o)})`;
    }
  }
  const stringStartsWith = (s, o) => `FILTER(STRSTARTS(${formatTerm(s)}, ${formatTerm(o)}))`;

  // SPARQL-specific built-ins for query patterns

  const sparqlBind = (s, o, vars) => {
    if (!(s instanceof ListTerm)) return;
    if (o instanceof Var && !vars.has(o.name)) {
      return `BIND(${formatSparqlExpression(s)} AS ${formatVar(o)})`;
    }
  }

  const sparqlFilter = (s, o) => {
    if (!(o instanceof ListTerm)) return;
    return `FILTER(${formatSparqlExpression(o)})`;
  }

  const sparqlMinus = (s, o, vars) => {
    if (!(o instanceof GraphTerm)) return;
    return `MINUS 
    { 
      ${toSparql(o.triples, new Set(vars))}
    }`;
  }
    
  const sparqlOptional = (s, o, vars) => {
    if (!(o instanceof GraphTerm)) return;
    return `OPTIONAL 
    { 
      ${toSparql(o.triples, new Set(vars))}
    }`;
  }

  const sparqlQuery = (s, o, vars) => {
    if (!(o instanceof GraphTerm)) return;
    return `
    {
    ${toSelectQuery(o, new Set(vars))}
    }
    `;
  }

  const sparqlUnion = (s, o, vars) => {
    if (!(s instanceof GraphTerm)) return;
    if (!(o instanceof GraphTerm)) return;
    return `{
      ${toSparql(s.triples, new Set(vars))}
    } UNION {
      ${toSparql(o.triples, new Set(vars))}
    }`;
  }



  const builtinReplacements = new Map([
    // crypto
    [ns.CRYPTO_NS + 'sha', cryptoSha],
    // math
    [ns.MATH_NS + 'greaterThan', mathGreaterThan],
    [ns.MATH_NS + 'lessThan', mathLessThan],
    [ns.MATH_NS + 'notGreaterThan', mathNotGreaterThan],
    [ns.MATH_NS + 'notLessThan', mathNotLessThan],
    [ns.MATH_NS + 'equalTo', mathEqualTo],
    [ns.MATH_NS + 'notEqualTo', mathNotEqualTo],
    [ns.MATH_NS + 'sum', mathSum],
    [ns.MATH_NS + 'product', mathProduct],
    [ns.MATH_NS + 'difference', mathDifference],
    [ns.MATH_NS + 'absoluteValue', mathAbsoluteValue],
    [ns.MATH_NS + 'rounded', mathRounded],
    // time
    [ns.TIME_NS + 'day', timeDay],
    [ns.TIME_NS + 'month', timeMonth],
    [ns.TIME_NS + 'year', timeYear],
    [ns.TIME_NS + 'minute', timeMinute],
    [ns.TIME_NS + 'second', timeSecond],
    [ns.TIME_NS + 'timezone', timeTimezone],
    // list
    [ns.LIST_NS + 'member', listMember],
    [ns.LIST_NS + 'in', listIn],
    // log
    [ns.LOG_NS + 'dtlit',logDtlit],
    [ns.LOG_NS + 'langlit', logLanglit],
    [ns.LOG_NS + 'includes', logIncludes],
    [ns.LOG_NS + 'notIncludes', logNotIncludes],
    [ns.LOG_NS + 'equalTo', logEqualTo],
    [ns.LOG_NS + 'notEqualTo', logNotEqualTo],
    // string
    [ns.STRING_NS + 'concatenation', stringConcatenation],
    [ns.STRING_NS + 'contains', stringContains],
    [ns.STRING_NS + 'containsIgnoringCase', stringContainsIgnoringCase],
    [ns.STRING_NS + 'endsWith', stringEndsWith],
    [ns.STRING_NS + 'equalIgnoringCase', stringEqualIgnoringCase],
    // string:format not supported
    [ns.STRING_NS + 'greaterThan', stringGreaterThan],
    [ns.STRING_NS + 'lessThan', stringLessThan],
    [ns.STRING_NS + 'matches', stringMatches],
    [ns.STRING_NS + 'notEqualIgnoringCase', stringNotEqualIgnoringCase],
    [ns.STRING_NS + 'notGreaterThan', stringNotGreaterThan],
    [ns.STRING_NS + 'notLessThan', stringNotLessThan],
    [ns.STRING_NS + 'notMatches', stringNotMatches],
    [ns.STRING_NS + 'replace', stringReplace],
    // string:scrape not supported
    [ns.STRING_NS + 'startsWith', stringStartsWith],

    // sparql
    [SPARQL_NS + 'bind', sparqlBind],
    [SPARQL_NS + 'filter', sparqlFilter],
    [SPARQL_NS + 'minus', sparqlMinus],
    // todo Group Graph Pattern?
    [SPARQL_NS + 'optional', sparqlOptional],
    [SPARQL_NS + 'query', sparqlQuery],
    [SPARQL_NS + 'union', sparqlUnion],
  ]);

  const operators = {}
  operators[SPARQL_NS + 'count'] = 'COUNT';
  operators[SPARQL_NS + 'sum'] = 'SUM';
  operators[SPARQL_NS + 'avg'] = 'AVG';
  operators[SPARQL_NS + 'min'] = 'MIN';
  operators[SPARQL_NS + 'max'] = 'MAX';
  operators[SPARQL_NS + 'sample'] = 'SAMPLE';
  operators[SPARQL_NS + 'concat'] = 'CONCAT';
  operators[SPARQL_NS + 'asc'] = 'ASC';
  operators[SPARQL_NS + 'desc'] = 'DESC';
  operators[SPARQL_NS + 'coalesce'] = 'COALESCE';
  operators[SPARQL_NS + 'str'] = 'STR';
  operators[SPARQL_NS + 'lang'] = 'LANG';
  operators[SPARQL_NS + 'datatype'] = 'DATATYPE';
  operators[SPARQL_NS + 'bound'] = 'BOUND';
  // ... add more operators as needed
 

  const comparers = {}
  comparers[SPARQL_NS + 'greaterThan'] = '>';
  comparers[SPARQL_NS + 'lessThan'] = '<';
  comparers[SPARQL_NS + 'notGreaterThan'] = '<=';
  comparers[SPARQL_NS + 'notLessThan'] = '>=';
  comparers[SPARQL_NS + 'equalTo'] = '=';
  comparers[SPARQL_NS + 'notEqualTo'] = '!=';

  function formatSparqlExpression(term) {
    if (term instanceof ListTerm) {
      const [ operator, ...operands] = term.elems;
      if (!(operator instanceof Iri)) return null;
      const op = operators[operator.value];
      if(op) {
        const args = operands.map(formatSparqlExpression).join(', ');
        return `${op}(${args})`;
      }
      const cmp = comparers[operator.value];
      if (cmp && operands.length === 2) {
        return `(${formatSparqlExpression(operands[0])} ${cmp} ${formatSparqlExpression(operands[1])})`;
      }
      if (operator.value === SPARQL_NS + 'bind') {
        return `(${formatSparqlExpression(operands[1])} AS ${formatVar(operands[0])})`;
      }
    } else {
      return formatTerm(term);
    }
  }

  const parseModifiers = term => {
    const modifiers = {};
    for (const triple of term.triples) {
      if (triple.p.value === SPARQL_NS + 'select' && triple.o instanceof ListTerm) {
        modifiers.select = triple.o.elems ;     
      }
      else if (triple.p.value === SPARQL_NS + 'from' && triple.o instanceof ListTerm) {
        modifiers.from = triple.o.elems ;     
      }
      else if (triple.p.value === SPARQL_NS + 'groupBy' && triple.o instanceof ListTerm) {
        modifiers.groupBy = triple.o.elems;
      }
      else if (triple.p.value === SPARQL_NS + 'having') {
        modifiers.having = triple.o;
      }
      else if (triple.p.value === SPARQL_NS + 'orderBy' && triple.o instanceof ListTerm) {
        modifiers.orderBy = triple.o.elems;
      }
      else if (triple.p.value === SPARQL_NS + 'limit' && triple.o instanceof Literal) {
        modifiers.limit = Number.parseInt(triple.o.value) ;
      }
      else if (triple.p.value === SPARQL_NS + 'offset' && triple.o instanceof Literal) {
        modifiers.offset = Number.parseInt(triple.o.value) ;
      }
    }
    return modifiers;
  }

  const caches = new Map();

  // register the builtin
  registerBuiltin(SPARQL_NS + 'query', (obj) => {
    const { goal } = obj;
    if (!(goal.s instanceof Iri)) return [];
    if (!(goal.o instanceof GraphTerm)) return [];

    const endpoint = goal.s.value;
    if (!caches.has(endpoint)) {
      caches.set(endpoint, new Map());
    }
    const cache = caches.get(endpoint);

    // collect variables to distinguish between bound and unbound variables in the SPARQL translation
    const vars = new Set();
    const query = toSelectQuery(goal.o, vars);

    if (cache.has(query)) {
      console.warn('Using cached result for query on ', endpoint, ':', query);
      return cache.get(query);
    }

    console.warn('Running query on ', endpoint, ':', query);
    const response = runQuery(endpoint, query);
    const substitutions = JSON.parse(response).results.bindings.map(getSubstitutions);
    // maybe (at least in forward rules) we can set the cache value to []
    cache.set(query, substitutions);
    return substitutions;
  });

  registerBuiltin(SPARQL_NS + 'ask', ({ goal }) => {
    if (!(goal.s instanceof Iri)) return [];
    if (!(goal.o instanceof GraphTerm)) return [];

    // collect variables to distinguish between bound and unbound variables in the SPARQL translation
    const vars = new Set();
    const query = 'ASK WHERE {\n' + toSparql(goal.o.triples, vars) + '\n}'

    const endpoint = goal.s.value;
    if (!caches.has(endpoint)) {
      caches.set(endpoint, new Map());
    }
    const cache = caches.get(endpoint);
    if (cache.has(query)) {
      // console.warn('Using cached result for query on ', endpoint, ':', query);
      return cache.get(query);
    }

    console.warn('Running query on ', endpoint, ':', query);
    const response = runQuery(endpoint, query);
    const result = JSON.parse(response).boolean;
    console.warn('Result:', result);
    const substitutions = result ? [{}] : [];
    cache.set(query, substitutions);
    return substitutions;
  });

  function formatSparqlPath(term) {
    if (term instanceof Iri) {
      return formatIri(term);
    }
    if (term instanceof Var) {
      return formatVar(term);
    }
    // assume it's a list term representing a path expression
    if(!(term instanceof ListTerm && term.elems.length > 0 && term.elems[0] instanceof Iri)) {
      throw new Error('Invalid path expression: ' + term);
    }
    
    const [first, ...rest] = term.elems;
    // assume first is Iri representing the operator, and rest are the operands
    if (first.value === SPARQL_NS + 'seq') {
      return rest.map(formatSparqlPath).join(' / ');
    }
    if (first.value === SPARQL_NS + 'alt') {
      return rest.map(formatSparqlPath).join(' | ');
    }
    if (first.value === SPARQL_NS + 'inv' && rest.length === 1) {
      return '^' + formatSparqlPath(rest[0]);
    }
    if (first.value === SPARQL_NS + 'zeroOrMore' && rest.length === 1) {
      return "(" + formatSparqlPath(rest[0]) + ")*";
    }
    if (first.value === SPARQL_NS + 'oneOrMore' && rest.length === 1) {
      return "(" + formatSparqlPath(rest[0]) + ")+";
    }
    if (first.value === SPARQL_NS + 'zeroOrOne' && rest.length === 1) {
      return "(" + formatSparqlPath(rest[0]) + ")?"; 
    }

    throw new Error('Invalid path expression: ' + term);
  
  }

  function toSelectQuery(graphTerm, vars) {
    const { select, from, groupBy, having, orderBy, limit, offset } = parseModifiers(graphTerm);
    const projection = select ? select.map(formatSparqlExpression).join(' ') : '*';
    let query = '\nSELECT ' + projection;
    if (from) {
      query += '\nFROM ' + from.map(formatIri).join(' ');
    }
    query += '\nWHERE {\n' + toSparql(graphTerm.triples, vars) + '\n}';
    if (groupBy) {
      query += '\nGROUP BY ' + groupBy.map(formatSparqlExpression).join(' ');
    }
    if (having) {
      query += '\nHAVING ' + formatSparqlExpression(having);
    }
    if (orderBy) {
      query += '\nORDER BY ' + orderBy.map(formatSparqlExpression).join(' ');
    }
    if (limit) {
      query += '\nLIMIT ' + limit;
    }
    if (offset) {
      query += '\nOFFSET ' + offset;
    }

    return query;
  }

  function toSparql(triples, vars) {
    const lines = [];
    for (const triple of triples) {
      const replacement = builtinReplacements.get(triple.p.value);
      if (replacement) {
        lines.push(`  ${replacement(triple.s, triple.o, vars)}`);
      }
      else if (!(triple.p instanceof Iri && triple.p.value.startsWith(SPARQL_NS))) {
        lines.push(`  ${formatTerm(triple.s)} ${formatSparqlPath(triple.p)} ${formatTerm(triple.o)} .`);
      }

      if (triple.s instanceof Var) vars.add(triple.s.name);
      if (triple.p instanceof Var) vars.add(triple.p.name);
      if (triple.o instanceof Var) vars.add(triple.o.name);
    }
    return lines.join('\n');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = sparqlBuiltin;
}

if (typeof globalThis !== 'undefined') {
  globalThis.sparqlBuiltin = sparqlBuiltin;
}
