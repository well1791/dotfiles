function c --description 'Open zed editor'
    if test (uname) = Darwin
        zed $argv
    else if test (uname) = Linux
        zeditor $argv
    else
        echo "Unsupported operating system."
        return 1
    end
end
