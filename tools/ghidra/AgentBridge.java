// Bounded evidence export and explicitly approved annotation changes.
//@category NancyRedrawn

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.*;

import com.google.gson.*;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressRange;
import ghidra.program.model.listing.*;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.symbol.*;

public class AgentBridge extends GhidraScript {
    private final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 4 && args[0].equals("export")) {
            exportEvidence(Path.of(args[1]), Integer.parseInt(args[2]), args[3]);
        } else if (args.length == 3 && args[0].equals("apply")) {
            applyApproved(Path.of(args[1]), Path.of(args[2]));
        } else if (args.length == 3 && args[0].equals("verify")) {
            verifyApproved(Path.of(args[1]), Path.of(args[2]));
        } else {
            throw new IllegalArgumentException("Expected export <output> <limit> <seed|-> or apply <approvals> <receipt>.");
        }
    }

    private String fingerprint() {
        String hash = currentProgram.getExecutableSHA256();
        if (hash == null || !hash.matches("[a-fA-F0-9]{64}")) {
            throw new IllegalArgumentException("Program has no valid executable SHA-256.");
        }
        return hash.toLowerCase(Locale.ROOT);
    }

    private List<Function> sorted(Collection<Function> functions) {
        List<Function> result = new ArrayList<>(functions);
        result.sort(Comparator.comparing(Function::getEntryPoint));
        return result;
    }

    private String bodyFingerprint(Function function) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        hash.update(function.getSignature().toString().getBytes(StandardCharsets.UTF_8));
        for (AddressRange range : function.getBody()) {
            hash.update(range.toString().getBytes(StandardCharsets.UTF_8));
            Address cursor = range.getMinAddress();
            long remaining = range.getLength();
            while (remaining > 0) {
                monitor.checkCancelled();
                byte[] chunk = new byte[(int) Math.min(remaining, 4096)];
                if (currentProgram.getMemory().getBytes(cursor, chunk) != chunk.length) {
                    throw new MemoryAccessException("Cannot fingerprint function bytes at " + cursor);
                }
                hash.update(chunk);
                remaining -= chunk.length;
                if (remaining > 0) cursor = cursor.add(chunk.length);
            }
        }
        return HexFormat.of().formatHex(hash.digest());
    }

    private List<String> neighbors(Collection<Function> functions) {
        List<String> result = new ArrayList<>();
        for (Function f : sorted(functions)) {
            if (result.size() == 32) break;
            String label = f.getEntryPoint() + " " + f.getName();
            result.add(label.substring(0, Math.min(label.length(), 500)));
        }
        return result;
    }

    private List<String> stringsFor(Function f) throws Exception {
        Set<String> strings = new LinkedHashSet<>();
        InstructionIterator instructions = currentProgram.getListing().getInstructions(f.getBody(), true);
        int scanned = 0;
        while (instructions.hasNext() && strings.size() < 32 && scanned++ < 4000) {
            monitor.checkCancelled();
            for (Reference ref : instructions.next().getReferencesFrom()) {
                Data data = currentProgram.getListing().getDefinedDataContaining(ref.getToAddress());
                if (data != null && data.getValue() instanceof String) {
                    String text = (String) data.getValue();
                    strings.add(text.substring(0, Math.min(text.length(), 500)));
                    if (strings.size() == 32) break;
                }
            }
        }
        return new ArrayList<>(strings);
    }

    private void exportEvidence(Path output, int limit, String seed) throws Exception {
        if (limit < 1 || limit > 100) throw new IllegalArgumentException("Export limit must be 1..100.");
        FunctionManager manager = currentProgram.getFunctionManager();
        Deque<Function> queue = new ArrayDeque<>();
        if (!seed.equals("-")) {
            Function f = manager.getFunctionAt(toAddr(seed));
            if (f == null || f.isExternal()) throw new IllegalArgumentException("Seed is not an internal function entry.");
            queue.add(f);
        } else {
            Set<Function> anchors = new HashSet<>();
            Iterator<Bookmark> bookmarks = currentProgram.getBookmarkManager().getBookmarksIterator();
            while (bookmarks.hasNext()) {
                monitor.checkCancelled();
                Bookmark bookmark = bookmarks.next();
                if (bookmark.getCategory().equals("NancyRedrawn XREF")) {
                    Function f = manager.getFunctionContaining(bookmark.getAddress());
                    if (f != null && !f.isExternal()) anchors.add(f);
                }
            }
            queue.addAll(sorted(anchors));
            if (queue.isEmpty()) {
                FunctionIterator functions = manager.getFunctions(true);
                while (functions.hasNext() && queue.size() < limit) {
                    Function f = functions.next();
                    if (!f.isExternal()) queue.add(f);
                }
            }
        }
        Set<Address> visited = new HashSet<>();
        JsonArray records = new JsonArray();
        DecompInterface decompiler = new DecompInterface();
        try {
            if (!decompiler.openProgram(currentProgram)) {
                throw new IllegalStateException("Cannot open decompiler: " + decompiler.getLastMessage());
            }
            while (!queue.isEmpty() && records.size() < limit) {
                monitor.checkCancelled();
                Function f = queue.removeFirst();
                if (f.isExternal() || !visited.add(f.getEntryPoint())) continue;
                Set<Function> callers = f.getCallingFunctions(monitor);
                Set<Function> callees = f.getCalledFunctions(monitor);
                for (Function neighbor : sorted(callers)) {
                    if (!neighbor.isExternal() && !visited.contains(neighbor.getEntryPoint())) queue.addLast(neighbor);
                }
                for (Function neighbor : sorted(callees)) {
                    if (!neighbor.isExternal() && !visited.contains(neighbor.getEntryPoint())) queue.addLast(neighbor);
                }
                DecompileResults result = decompiler.decompileFunction(f, 30, monitor);
                boolean completed = result.decompileCompleted() && result.getDecompiledFunction() != null;
                String code = completed ? result.getDecompiledFunction().getC() : "";
                String error = completed ? "" : String.valueOf(result.getErrorMessage());
                String bodyHash = "";
                try {
                    bodyHash = bodyFingerprint(f);
                } catch (MemoryAccessException unreadable) {
                    error = "Cannot fingerprint function bytes: " + unreadable.getMessage();
                }
                JsonObject record = new JsonObject();
                record.addProperty("address", f.getEntryPoint().toString());
                record.addProperty("name", f.getName());
                record.addProperty("bodySha256", bodyHash);
                record.addProperty("comment", f.getComment() == null ? "" : f.getComment());
                record.addProperty("code", code.substring(0, Math.min(code.length(), 24000)));
                record.addProperty("codeTruncated", code.length() > 24000);
                record.addProperty("decompileError", error);
                record.add("callers", gson.toJsonTree(neighbors(callers)));
                record.add("callees", gson.toJsonTree(neighbors(callees)));
                record.add("strings", gson.toJsonTree(stringsFor(f)));
                records.add(record);
            }
        } finally {
            decompiler.dispose();
        }
        JsonObject evidence = new JsonObject();
        evidence.addProperty("schemaVersion", 1);
        evidence.addProperty("programName", currentProgram.getName());
        evidence.addProperty("programSha256", fingerprint());
        evidence.addProperty("language", currentProgram.getLanguageID().toString());
        evidence.add("functions", records);
        Files.writeString(output, gson.toJson(evidence), StandardCharsets.UTF_8);
        println("NancyRedrawn exported " + records.size() + " function records.");
    }

    private void applyApproved(Path input, Path receipt) throws Exception {
        JsonObject manifest = JsonParser.parseString(Files.readString(input)).getAsJsonObject();
        if (manifest.get("schemaVersion").getAsInt() != 1 ||
            !fingerprint().equals(manifest.get("programSha256").getAsString())) {
            throw new IllegalArgumentException("Approval schema or binary fingerprint does not match.");
        }
        JsonArray approvals = manifest.getAsJsonArray("approvals");
        if (approvals.size() < 1 || approvals.size() > 100) {
            throw new IllegalArgumentException("Expected 1..100 approved changes.");
        }
        Set<Address> seen = new HashSet<>();
        Set<String> names = new HashSet<>();
        List<Function> targets = new ArrayList<>();
        for (JsonElement element : approvals) {
            monitor.checkCancelled();
            JsonObject change = element.getAsJsonObject();
            Function f = currentProgram.getFunctionManager().getFunctionAt(toAddr(change.get("address").getAsString()));
            String name = change.get("suggestedName").getAsString();
            String comment = change.get("comment").getAsString();
            if (f == null || f.isExternal() || f.isThunk() || !seen.add(f.getEntryPoint()) ||
                !names.add(name) || !name.matches("[A-Za-z_][A-Za-z0-9_]{0,79}") ||
                comment.length() > 1500 || !comment.startsWith("[NancyRedrawn AI hypothesis; human-approved, not verified]\n") ||
                !f.getName().equals(change.get("originalName").getAsString()) ||
                !bodyFingerprint(f).equals(change.get("bodySha256").getAsString()) ||
                !(f.getComment() == null ? "" : f.getComment()).equals(change.get("originalComment").getAsString()) ||
                f.getSymbol().getSource() == SourceType.USER_DEFINED ||
                !fingerprint().equals(change.get("programSha256").getAsString())) {
                throw new IllegalArgumentException("Stale, duplicate, protected or invalid change: " + change.get("address"));
            }
            for (Function existing : getGlobalFunctions(name)) {
                if (!existing.equals(f)) throw new IllegalArgumentException("Function name already exists: " + name);
            }
            targets.add(f);
        }
        int transaction = currentProgram.startTransaction("NancyRedrawn approved annotations");
        boolean committed = false;
        try {
            for (int i = 0; i < targets.size(); i++) {
                monitor.checkCancelled();
                JsonObject change = approvals.get(i).getAsJsonObject();
                Function f = targets.get(i);
                f.setName(change.get("suggestedName").getAsString(), SourceType.USER_DEFINED);
                String original = change.get("originalComment").getAsString();
                f.setComment((original.isEmpty() ? "" : original + "\n\n") + change.get("comment").getAsString());
            }
            committed = true;
        } finally {
            currentProgram.endTransaction(transaction, committed);
        }
        JsonObject result = new JsonObject();
        result.addProperty("status", "staged");
        result.addProperty("count", targets.size());
        result.addProperty("evidenceHash", manifest.get("evidenceHash").getAsString());
        Files.writeString(receipt, gson.toJson(result), StandardCharsets.UTF_8);
        println("NancyRedrawn staged " + targets.size() + " approved changes for headless save.");
    }

    private void verifyApproved(Path input, Path receipt) throws Exception {
        JsonObject manifest = JsonParser.parseString(Files.readString(input)).getAsJsonObject();
        if (!fingerprint().equals(manifest.get("programSha256").getAsString())) {
            throw new IllegalArgumentException("Verification binary fingerprint differs.");
        }
        JsonArray approvals = manifest.getAsJsonArray("approvals");
        for (JsonElement element : approvals) {
            JsonObject change = element.getAsJsonObject();
            Function f = currentProgram.getFunctionManager().getFunctionAt(toAddr(change.get("address").getAsString()));
            String original = change.get("originalComment").getAsString();
            String expected = (original.isEmpty() ? "" : original + "\n\n") + change.get("comment").getAsString();
            if (f == null || !f.getName().equals(change.get("suggestedName").getAsString()) ||
                !expected.equals(f.getComment())) {
                throw new IllegalArgumentException("Saved annotations do not match approval: " + change.get("address"));
            }
        }
        JsonObject result = new JsonObject();
        result.addProperty("status", "applied");
        result.addProperty("count", approvals.size());
        result.addProperty("evidenceHash", manifest.get("evidenceHash").getAsString());
        Files.writeString(receipt, gson.toJson(result), StandardCharsets.UTF_8);
    }
}
