// Ghidra script to locate and bookmark key Her Interactive engine signatures and xrefs in Game.exe
//@category NancyRedrawn
//@author NancyRedrawn

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.data.StringDataType;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.SourceType;

public class IdentifyEngineStrings extends GhidraScript {

    private static final String[] ENGINE_KEYWORDS = {
        "CIF TREE",
        "Nancy Data",
        "ExternalCifFileChecking",
        "CifTreeAndFilesOnCD",
        "RunInWindowedMode",
        "TestingModeEnabled",
        "Nancy.cid",
        "Game.ini",
        ".CIF",
        ".AVF",
        ".CAL",
        ".HIS"
    };

    @Override
    public void run() throws Exception {
        println("=== Starting NancyRedrawn Engine Identifier ===");
        Memory memory = currentProgram.getMemory();
        Listing listing = currentProgram.getListing();

        for (String keyword : ENGINE_KEYWORDS) {
            byte[] bytes = keyword.getBytes("ASCII");
            Address currentAddress = memory.getMinAddress();

            while (currentAddress != null) {
                Address match = memory.findBytes(currentAddress, bytes, null, true, monitor);
                if (match == null) {
                    break;
                }

                createBookmark(match, "NancyRedrawn", "Engine String: " + keyword);
                setPlateComment(match, "NancyRedrawn Engine Identifier: " + keyword);

                Reference[] refs = getReferencesTo(match);
                println(String.format("Found '%s' at %s (xrefs: %d)", keyword, match, refs.length));

                for (Reference ref : refs) {
                    Address fromAddr = ref.getFromAddress();
                    createBookmark(fromAddr, "NancyRedrawn XREF", "Reference to " + keyword);
                    Function func = listing.getFunctionContaining(fromAddr);
                    if (func != null) {
                        println(String.format("  -> Referenced in function %s at %s", func.getName(), fromAddr));
                    }
                }

                currentAddress = match.add(bytes.length);
            }
        }
        println("=== Finished NancyRedrawn Engine Identifier ===");
    }
}
