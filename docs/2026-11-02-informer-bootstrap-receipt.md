# Informer bootstrap behavior receipt

Issue: omniviewdev/omniview-plugin-kubernetes#57; P10 #30. Status: draft behavior evidence, not full issue acceptance.

Baseline: `ddf54bcdc0f95dddb1308169e3c5c09c0887e678`. Candidate: this receipt's commit. Host sibling: `baseff593`; SDK sibling: `0a5b64ed`. The tests use the workspace dependency configuration, not a live native application.

## Method and limits

`TestInformerBootstrapProbe` invokes the actual Kubernetes resourcer Watch, `AcquireInformer`, client-go shared informer, and a recording sink. A controlled HTTP server supplies realistic synthetic Pod documents and streaming initial events. Each case runs once, with no warmup; the warm consumer attaches to the still-running cold consumer's exact source. The scoped case uses namespace `default`. There is no UI, viewport, cluster, native CPU, or real network measurement. Payload bytes are JSON encodings of sink payloads, not measured bridge traffic. Encoding time includes payload counting and excludes the earlier conversion inside the production handler. Start-to-synced includes preflight and handler delivery; attachment and LIST/sync costs were not separately timed. The server records two preflight LIST requests and one shared WATCH per case. Mutation coverage uses a separate controlled fake dynamic transport and real shared informer.

The baseline probe intentionally fails because each expected identity arrives twice. The candidate emits each identity once. Store replay was redundant after registration `HasSynced`, which waits for the handler's initial delivery. Client-go serializes late handler attachment against deltas. The replay could also reorder an old store object against newer events. Counts remain estimates from the store; this does not establish an atomic snapshot or gap-free source.

Regression coverage includes an initial callback held across ADD, UPDATE and DELETE, late attachment, concurrent starts, cancellation with another consumer still active, watch reconnect, empty scope and forbidden preflight. Full proof for independently forbidden/error namespace partitions, separate attachment-vs-sync timing, and complete #57 acceptance remains outstanding. Existing best-effort guarantee and unchanged-version UPDATE guard remain unchanged. C04's future source-session adapter must explicitly establish its own snapshot/update boundary and guarantees; this advisory stream is not a gap-free session.

## Commands actually run

```sh
go test ./pkg/plugin/resource/resourcers -run '^TestInformerBootstrapProbe$' -count=1 -v
go test ./pkg/plugin/resource/resourcers ./pkg/plugin/resource/clients -count=1
go test -race ./pkg/plugin/resource/resourcers ./pkg/plugin/resource/clients -count=1
go test ./pkg/plugin/resource/resourcers -run '^TestInformerConsumerAttachmentAndLateSubscriber$' -count=1
go test -race ./pkg/plugin/resource/resourcers -run '^TestInformerConsumerAttachmentAndLateSubscriber$' -count=1
```

The baseline probe failed its duplicate assertion, as intended. The candidate probe, focused package tests, race tests, and final mutation-specific tests passed. Package tests ran before the final mutation assertion was added; the mutation-specific commands ran afterwards.

## Raw baseline

```text
=== RUN   TestInformerBootstrapProbe
=== RUN   TestInformerBootstrapProbe/objects=300/scoped=false
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=325881
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=600 duplicate_ids=300 missing=[] unexpected=[] encoded_json_bytes=1918800 encode_and_count=110.438373ms watch_start_to_synced=450.869329ms watch_start_to_all_adds=450.899644ms
    bootstrap_probe_test.go:148: cold initial IDs differ from expected
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=600 duplicate_ids=300 missing=[] unexpected=[] encoded_json_bytes=1918800 encode_and_count=171.307307ms watch_start_to_synced=375.987056ms watch_start_to_all_adds=376.03293ms
    bootstrap_probe_test.go:148: warm-shared initial IDs differ from expected
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
=== RUN   TestInformerBootstrapProbe/objects=300/scoped=true
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=325881
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=600 duplicate_ids=300 missing=[] unexpected=[] encoded_json_bytes=1918800 encode_and_count=104.759078ms watch_start_to_synced=486.150162ms watch_start_to_all_adds=486.190686ms
    bootstrap_probe_test.go:148: cold initial IDs differ from expected
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=600 duplicate_ids=300 missing=[] unexpected=[] encoded_json_bytes=1918800 encode_and_count=207.585174ms watch_start_to_synced=416.286328ms watch_start_to_all_adds=416.338919ms
    bootstrap_probe_test.go:148: warm-shared initial IDs differ from expected
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
=== RUN   TestInformerBootstrapProbe/objects=3000/scoped=false
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=3258081
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=6000 duplicate_ids=3000 missing=[] unexpected=[] encoded_json_bytes=19188000 encode_and_count=1.098960581s watch_start_to_synced=3.936064598s watch_start_to_all_adds=3.936100358s
    bootstrap_probe_test.go:148: cold initial IDs differ from expected
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=6000 duplicate_ids=3000 missing=[] unexpected=[] encoded_json_bytes=19188000 encode_and_count=955.748864ms watch_start_to_synced=2.340642877s watch_start_to_all_adds=2.340689613s
    bootstrap_probe_test.go:148: warm-shared initial IDs differ from expected
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
=== RUN   TestInformerBootstrapProbe/objects=3000/scoped=true
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=3258081
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=6000 duplicate_ids=3000 missing=[] unexpected=[] encoded_json_bytes=19188000 encode_and_count=1.221195583s watch_start_to_synced=3.996324558s watch_start_to_all_adds=3.996387237s
    bootstrap_probe_test.go:148: cold initial IDs differ from expected
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=6000 duplicate_ids=3000 missing=[] unexpected=[] encoded_json_bytes=19188000 encode_and_count=1.708380551s watch_start_to_synced=2.545132138s watch_start_to_all_adds=2.545189753s
    bootstrap_probe_test.go:148: warm-shared initial IDs differ from expected
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
--- FAIL: TestInformerBootstrapProbe (20.71s)
    --- FAIL: TestInformerBootstrapProbe/objects=300/scoped=false (1.20s)
    --- FAIL: TestInformerBootstrapProbe/objects=300/scoped=true (1.25s)
    --- FAIL: TestInformerBootstrapProbe/objects=3000/scoped=false (8.59s)
    --- FAIL: TestInformerBootstrapProbe/objects=3000/scoped=true (9.68s)
FAIL
FAIL	github.com/omniview/kubernetes/pkg/plugin/resource/resourcers	20.852s
FAIL
```

## Raw candidate

```text
=== RUN   TestInformerBootstrapProbe
=== RUN   TestInformerBootstrapProbe/objects=300/scoped=false
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=325881
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=300 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=959400 encode_and_count=72.21096ms watch_start_to_synced=378.174336ms watch_start_to_all_adds=378.246907ms
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=300 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=959400 encode_and_count=99.372908ms watch_start_to_synced=290.947971ms watch_start_to_all_adds=290.996598ms
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
=== RUN   TestInformerBootstrapProbe/objects=300/scoped=true
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=325881
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=300 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=959400 encode_and_count=111.733279ms watch_start_to_synced=380.155505ms watch_start_to_all_adds=380.223396ms
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-0299 expected_count=300 unique_ids=300 adds=300 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=959400 encode_and_count=95.428268ms watch_start_to_synced=261.052081ms watch_start_to_all_adds=261.092653ms
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
=== RUN   TestInformerBootstrapProbe/objects=3000/scoped=false
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=3258081
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=3000 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=9594000 encode_and_count=741.897168ms watch_start_to_synced=2.920435286s watch_start_to_all_adds=2.920478273s
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=3000 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=9594000 encode_and_count=703.609118ms watch_start_to_synced=1.991011115s watch_start_to_all_adds=1.991055275s
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
=== RUN   TestInformerBootstrapProbe/objects=3000/scoped=true
    bootstrap_probe_test.go:151: fixture=controlled-http list_bytes=3258081
    bootstrap_probe_test.go:146: cold expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=3000 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=9594000 encode_and_count=717.254089ms watch_start_to_synced=2.986695943s watch_start_to_all_adds=2.986778491s
    bootstrap_probe_test.go:146: warm-shared expected_ids=probe-0000..probe-2999 expected_count=3000 unique_ids=3000 adds=3000 duplicate_ids=0 missing=[] unexpected=[] encoded_json_bytes=9594000 encode_and_count=780.997898ms watch_start_to_synced=1.990618896s watch_start_to_all_adds=1.99066553s
    bootstrap_probe_test.go:156: transport list_requests=2 watch_requests=1
--- PASS: TestInformerBootstrapProbe (14.98s)
    --- PASS: TestInformerBootstrapProbe/objects=300/scoped=false (0.87s)
    --- PASS: TestInformerBootstrapProbe/objects=300/scoped=true (0.88s)
    --- PASS: TestInformerBootstrapProbe/objects=3000/scoped=false (6.57s)
    --- PASS: TestInformerBootstrapProbe/objects=3000/scoped=true (6.66s)
PASS
ok  	github.com/omniview/kubernetes/pkg/plugin/resource/resourcers	15.059s
```

## Follow-up handoff and partition proof

The standalone `go run /tmp/ri-p10-handoff-probe.go` invoked the production resourcer and shared informer against a controlled fake dynamic transport. Its one-off output was:

```text
cold events=[ADD:initial ADD:added UPDATE:initial DELETE:initial] current=map[added:1]
warm events=[ADD:added] current=map[added:1]
native_sources=1 bestEffort=true controlled_transport=fake-dynamic
final_watch_stopped=true
```

The retained `TestWarmInformerHandoffProbe` additionally blocks the warm subscriber during initial delivery while the native watch adds, updates, and deletes objects. It checks ordered delivery, final identity, shared ownership, cancellation, and final cleanup. `TestInformerPartitionOutcomes` covers empty, skipped, scoped forbidden and transient-error cases.

A separate exploratory test added two cases to that fixture: team-a contains one Pod, team-b LIST returns 403 or a transient error. Both baseline and candidate returned state 2 (Synced), estimate 1, and no error after the 30-second sync deadline, concealing the failed namespace. Those exploratory assertions intentionally failed and are not retained as passing tests. The legacy first-namespace 404/405 preflight can also skip the whole request; that observation is from source inspection, not the experiment. Do not treat these states as truthful coverage. Ticket `omn-yjgt` depends on C04 freeze `omn-b5ju` and requires the session adapter to disclose partial and error coverage. Issue #57 remains open until aggregate acceptance.

Commands (controlled transport, no live cluster):

```sh
go run /tmp/ri-p10-handoff-probe.go
go test ./pkg/plugin/resource/resourcers -run '^(TestWarmInformerHandoffProbe|TestInformerPartitionEmptySelection|TestInformerPartitionOutcomes)$' -count=1 -v
go test ./pkg/plugin/resource/resourcers -run '^TestInformerPartitionOutcomes/(partial_forbidden|partial_error)$' -count=1 -v
go test -race ./pkg/plugin/resource/resourcers -run '^(TestWarmInformerHandoffProbe|TestInformerPartitionEmptySelection|TestInformerPartitionOutcomes)$' -count=1 -v
```

The exploratory partial cases were present only during the baseline and candidate comparisons. The last command used the retained passing cases.

### Baseline partial-scope raw output

```text
=== RUN   TestInformerPartitionOutcomes
=== RUN   TestInformerPartitionOutcomes/partial_forbidden
E1102 02:50:27.091484  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:50:28.584959  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:50:31.167178  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:50:35.727828  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:50:45.992716  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
    informer_partition_outcomes_test.go:99: observed state=2 count_kind=estimate count=1 error_nil=true
    informer_partition_outcomes_test.go:103: 
        	Error Trace:	/home/mononen/omniview/workspaces/ri-p10/omniview-plugin-kubernetes/pkg/plugin/resource/resourcers/informer_partition_outcomes_test.go:103
        	Error:      	Not equal: 
        	            	expected: 6
        	            	actual  : 2
        	Test:       	TestInformerPartitionOutcomes/partial_forbidden
        	Messages:   	aggregate state must disclose failed scoped partitions
=== RUN   TestInformerPartitionOutcomes/partial_error
E1102 02:50:57.104429  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:50:58.335057  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:51:00.464572  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:51:05.085356  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:51:13.804897  250627 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
    informer_partition_outcomes_test.go:99: observed state=2 count_kind=estimate count=1 error_nil=true
    informer_partition_outcomes_test.go:103: 
        	Error Trace:	/home/mononen/omniview/workspaces/ri-p10/omniview-plugin-kubernetes/pkg/plugin/resource/resourcers/informer_partition_outcomes_test.go:103
        	Error:      	Not equal: 
        	            	expected: 3
        	            	actual  : 2
        	Test:       	TestInformerPartitionOutcomes/partial_error
        	Messages:   	aggregate state must disclose failed scoped partitions
--- FAIL: TestInformerPartitionOutcomes (60.03s)
    --- FAIL: TestInformerPartitionOutcomes/partial_forbidden (30.01s)
    --- FAIL: TestInformerPartitionOutcomes/partial_error (30.01s)
FAIL
FAIL	github.com/omniview/kubernetes/pkg/plugin/resource/resourcers	60.076s
FAIL
```

### Candidate partial-scope raw output

```text
=== RUN   TestInformerPartitionOutcomes
=== RUN   TestInformerPartitionOutcomes/partial_forbidden
E1102 02:51:43.711683  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:51:45.128938  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:51:46.851017  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:51:52.562734  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:52:02.056392  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: pods is forbidden: denied" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
    informer_partition_outcomes_test.go:99: observed state=2 count_kind=estimate count=1 error_nil=true
    informer_partition_outcomes_test.go:103: 
        	Error Trace:	/home/mononen/omniview/workspaces/ri-p10/omniview-plugin-kubernetes/pkg/plugin/resource/resourcers/informer_partition_outcomes_test.go:103
        	Error:      	Not equal: 
        	            	expected: 6
        	            	actual  : 2
        	Test:       	TestInformerPartitionOutcomes/partial_forbidden
        	Messages:   	aggregate state must disclose failed scoped partitions
=== RUN   TestInformerPartitionOutcomes/partial_error
E1102 02:52:13.725987  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:52:15.113131  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:52:17.435286  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:52:21.575598  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
E1102 02:52:34.350905  271738 reflector.go:204] "Failed to watch" err="failed to list /v1, Resource=pods: list failed" logger="UnhandledError" reflector="pkg/mod/k8s.io/client-go@v0.35.0/tools/cache/reflector.go:289" type="/v1, Resource=pods"
    informer_partition_outcomes_test.go:99: observed state=2 count_kind=estimate count=1 error_nil=true
    informer_partition_outcomes_test.go:103: 
        	Error Trace:	/home/mononen/omniview/workspaces/ri-p10/omniview-plugin-kubernetes/pkg/plugin/resource/resourcers/informer_partition_outcomes_test.go:103
        	Error:      	Not equal: 
        	            	expected: 3
        	            	actual  : 2
        	Test:       	TestInformerPartitionOutcomes/partial_error
        	Messages:   	aggregate state must disclose failed scoped partitions
--- FAIL: TestInformerPartitionOutcomes (60.02s)
    --- FAIL: TestInformerPartitionOutcomes/partial_forbidden (30.01s)
    --- FAIL: TestInformerPartitionOutcomes/partial_error (30.01s)
FAIL
FAIL	github.com/omniview/kubernetes/pkg/plugin/resource/resourcers	60.074s
FAIL
```
