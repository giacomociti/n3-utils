## The SPARQL builtin

[Notation-3](https://notation3.org/) is a powerful rules language, and [builtins](https://notation3.org/#n3-builtin) greatly contribute 
to its expressiveness. The [eyeling](https://eyereasoner.github.io/eyeling/) implementation allows adding
[custom builtins](https://eyereasoner.github.io/eyeling/HANDBOOK#chapter-16--extending-eyeling-without-breaking-it), and this repository provides one for integrating SPARQL queries
into rules.

The `sparql:query` builtin expects a SPARQL endpoint IRI in the subject position and a graph term containing the query to execute in the object position.

In the following example, we use a QLever endpoint to query Wikidata for the author of a famous painting:

```turtle
@prefix wd: <http://www.wikidata.org/entity/> .
@prefix wdt: <http://www.wikidata.org/prop/direct/> .
@prefix sparql: <https://raw.githubusercontent.com/giacomociti/n3-utils/refs/heads/main/builtins/sparql.js#> .

{ 
    <https://qlever.dev/api/wikidata> sparql:query {
        wd:Q12418 wdt:P170 ?author .
        ?author wdt:P1477 ?name .
    } .
}
=> 
{ 
    wd:Q12418 wdt:P170 ?author .
    ?author wdt:P1477 ?name .
} .
```

Basic graph patterns are the same in SPARQL and N3, so the builtin executes the following SPARQL query:

```sparql
SELECT * WHERE {
    wd:Q12418 wdt:P170 ?author .
    ?author wdt:P1477 ?name . 
}
```

making the solution bindings available in the reasoner.

The eyeling CLI allows you to run rules with custom builtins:

```sh
npx eyeling --builtin sparql.js rules.n3
```

### N3-builtins within SPARQL queries

In the graph term for the query, besides BGPs, we can use many of the 
[official N3 builtins](https://w3c-cg.github.io/N3/spec/#builtins), for example `log:langlit`:

```turtle
{ 
    <https://qlever.dev/api/wikidata> sparql:query {
        wd:Q12418 wdt:P1476 ?title .
        (?text 'it') log:langlit ?title .
    } .
}
=> 
{ 
    wd:Q12418 wdt:P1476 ?title .
} .
```

Many builtins recognized within the graph term of `sparql:query` are converted to FILTER or BIND clauses in SPARQL (bound variables produce FILTERs, unbound variables produce BINDs),

 In this example, the query will be:

```sparql
SELECT * WHERE {
    wd:Q12418 wdt:P1476 ?title .
    BIND(STR(?title) AS ?text)
    FILTER(LANG(?title) = 'it')
}
```


Using an unbound variable for the language:

```turtle
{ 
    <https://qlever.dev/api/wikidata> sparql:query {
        wd:Q12418 wdt:P1476 ?title .
        (?text ?lang) log:langlit ?title .
    } .
}
=> 
{ 
    wd:Q12418 wdt:P1476 [
        ex:title ?text ;
        ex:language ?lang 
    ]
} .
```

the corresponding SPARQL query will bind it:

```sparql
SELECT * WHERE {
    wd:Q12418 wdt:P1476 ?title .
	BIND(STR(?title) AS ?text)
    BIND(LANG(?title) AS ?lang)
}
```

The builtins `log:includes` and `log:notIncludes` become `FILTER EXISTS` and `FILTER NOT EXISTS`, respectively.



The list of builtins that are recognized and translated to SPARQL is available in [test-builtins.n3](../examples/sparql/test-builtins.n3). 

These tests leverage another builtin with an interesting SPARQL translation: `list:in` corresponds to VALUES.


## Optional, Union etc.
The nice thing about standard builtins being recognized and converted to SPARQL is that we have
a uniform notation across local rules and remote SPARQL queries.

But there are also predicates that have a specific meaning only in a SPARQL context.
This way, we can express more complex queries, for example with OPTIONAL, UNION, etc..

The graph term in the object position of `sparql:optional` becomes an OPTIONAL clause in SPARQL (the subject is ignored):

```turtle
{ 
    <https://qlever.dev/api/wikidata> sparql:query {
        wd:Q12418 wdt:P170 ?author .
        [] sparql:optional { ?author wdt:P1477 ?name } 
    } .
}
=> 
{ 
    wd:Q12418 wdt:P170 ?author .
    ?author wdt:P1477 ?name .
} .
```


For `sparql:union`, both the subject and object must be graph terms:

```turtle
{ 
    <https://qlever.dev/api/wikidata> sparql:query {
        wd:Q12418 wdt:P170 ?author .
        {
            wd:Q12418 wdt:P1476 ?label .
            ([] 'en') log:langlit ?label .
        } 
        sparql:union 
        {
            wd:Q12418 skos:altLabel ?label .
            ([] 'en') log:langlit ?label .
        }
    } .
}
=> 
{ 
    wd:Q12418 rdfs:label ?label
} .
```


## More SPARQL
SPARQL queries can be refined even further with solution modifiers, aggregations etc.

For example, predicates like `sparql:select`, `sparql:orderBy` and `sparql:limit` specify
the list of variables to project, the list for ordering, and the
maximum number of results respectively.

Their subject is ignored, so we can use the same blank node in this example:

```turtle
{ 
    <http://localhost:7001> sparql:query {
        
        ?s a ex:Person ;
            ex:name ?name ;
            ex:surname ?surname .

        [
            sparql:select (?surname ?name) ;
            sparql:orderBy (?surname) ;
            sparql:limit 10 ;
        ] .
    } .
} 
=> 
{ 
    [] ex:name ?name ;
        ex:surname ?surname .
} .
```

So far, the notation is straightforward. But we often need to represent more
complex expressions. In these cases, we leverage N3 lists to represent SPARQL
expressions abstractly, much like [S-Expressions](https://en.wikipedia.org/wiki/S-expression):

```turtle
{ 
    <http://localhost:7001> sparql:query {
        [
            sparql:select (?place (sparql:bind ?count (sparql:count ?person))) ;
            sparql:groupBy (?place) ;
            sparql:having (sparql:greaterThan (sparql:count ?person) 10) ;
            sparql:orderBy ((sparql:desc ?place)) ;
        ] .

        ?person (sparql:seq rdf:type (sparql:zeroOrMore rdfs:subClassOf)) ex:Person .
        ?person ex:birthPlace ?place .
    } .
} 
=> 
{ 
    ?place ex:count ?count
} .

```

This is definitively less straightforward, but it can be done when needed.
The correspoinding SPARQL is:


```sparql
SELECT ?place (COUNT(?person) AS ?count)
WHERE {
    ?person rdf:type/rdfs:subClassOf* ex:Person .
    ?person ex:birthPlace ?place .
}
GROUP BY ?place
HAVING (COUNT(?person) > 10)
ORDER BY DESC(?place)
```

## the format builtin
Another builtin, `sparql:format`, generates SPARQL text
from a graph term without executing the query.

This is useful for experimentation and debugging, and for other
cases where you want to generate SPARQL without running it.

See [test-format.n3](../examples/sparql/test-format.n3) for usage examples.
